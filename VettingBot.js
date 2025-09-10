const { Client, GatewayIntentBits } = require('discord.js');
const VeyraAPI = require('./VeyraAPI');
const { registerSlashCommands } = require('./slashCommands');
const { handleVetCommand, handleVetStatusCommand, handleVetListCommand } = require('./commandHandlers');
const { handleVettingDecision } = require('./vettingHandler');
const { handleRepButtonInteraction, addButtonsToExistingCommissions, handleCreateCommissionCommand, handleRepCommand, handleRenameCommissionCommand, handleCloseCommissionCommand } = require('./commissionHandlers');
// Import storage systems
const { vettingStorage, commissionStorage } = require('./persistantStorage');

/**
 * Main Discord bot class for handling vetting and commissions
 */
class VettingBot {
  constructor(config) {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });
    
    this.config = config;
    this.api = new VeyraAPI(config.veyra.baseUrl, config.veyra.username, config.veyra.password);
    
    // Storage systems are initialized automatically when the module is loaded
    this.vettingStorage = vettingStorage;
    this.commissionStorage = commissionStorage;
    
    this.setupEventHandlers();
  }

  /**
   * Set up Discord client event handlers
   */
  setupEventHandlers() {
    this.client.once('ready', async () => {
      console.log(`Bot logged in as ${this.client.user.tag}`);
      
      try {
        await this.api.login();
        console.log('API login successful');
      } catch (error) {
        console.error('API login failed:', error);
      }

      try {
        await registerSlashCommands(this.config);
        console.log('Slash commands registered successfully');
      } catch (error) {
        console.error('Failed to register slash commands:', error);
      }

      // Display storage statistics on startup
      await this.displayStorageStats();

      // Start cleanup scheduler (run every 24 hours)
      setInterval(() => {
        this.cleanupOldSessions();
      }, 24 * 60 * 60 * 1000);

      // Run initial cleanup
      setTimeout(() => {
        this.cleanupOldSessions();
      }, 5000); // Wait 5 seconds after startup
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('deny_')) {
          await handleVettingDecision(interaction, this.api, this.config);
        }
        else if (interaction.customId.startsWith('rep_')) {
            await handleRepButtonInteraction(interaction);
        }
      }
    });

    // Handle errors
    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('Received SIGINT, shutting down gracefully...');
      this.shutdown();
    });

    process.on('SIGTERM', () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      this.shutdown();
    });
  }

  /**
   * Route slash commands to appropriate handlers
   */
  async handleSlashCommand(interaction) {
    const { commandName } = interaction;
    
    try {
      switch (commandName) {
        // Vetting commands
        case 'vet':
          await handleVetCommand(interaction, this.api, this.config);
          break;
        case 'vetstatus':
          await handleVetStatusCommand(interaction);
          break;
        case 'vetlist':
          await handleVetListCommand(interaction, this.config);
          break;

        // Commission commands
        case 'create-commission':
          await handleCreateCommissionCommand(interaction, this.config);
          break;
        case 'rep':
          await handleRepCommand(interaction);
          break;
        case 'rename-commission':
          await handleRenameCommissionCommand(interaction, this.config);
          break;
        case 'close-commission':
          await handleCloseCommissionCommand(interaction);
          break;
        case 'add-buttons':
          await this.handleAddButtonsCommand(interaction);
          break;

        // Admin commands
        case 'cleanup':
          await this.handleCleanupCommand(interaction);
          break;
        case 'stats':
          await this.handleStatsCommand(interaction);
          break;

        default:
          await interaction.reply({
            content: 'Unknown command.',
            ephemeral: true
          });
      }
    } catch (error) {
      console.error(`Error handling command ${commandName}:`, error);
      const reply = {
        content: 'An error occurred while processing your command.',
        ephemeral: true
      };
     
      if (interaction.deferred) {
        await interaction.editReply(reply);
      } else {
        await interaction.reply(reply);
      }
    }
  }

  async handleAddButtonsCommand(interaction) {
    // Check if user is admin
    if (!interaction.member.roles.cache.has(this.config.discord.adminRoleId)) {
        return interaction.reply({
            content: 'You don\'t have permission to use this command.',
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const updatedCount = await addButtonsToExistingCommissions(interaction.guild, this.config);
        await interaction.editReply(`Added buttons to ${updatedCount} existing commission embeds.`);
    } catch (error) {
        console.error('Error adding buttons to existing commissions:', error);
        await interaction.editReply('An error occurred while adding buttons to existing commissions.');
    }
  }
  
  /**
   * Handle the cleanup command (admin only)
   */
  async handleCleanupCommand(interaction) {
    // Check if user is admin
    if (!interaction.member.roles.cache.has(this.config.discord.adminRoleId)) {
      return interaction.reply({
        content: 'You don\'t have permission to use this command.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const vettingsCleanedUp = await this.vettingStorage.cleanup();
      const commissionsCleanedUp = await this.commissionStorage.cleanup();

      await interaction.editReply({
        content: `Cleanup completed!\n• Vettings cleaned up: ${vettingsCleanedUp}\n• Commissions cleaned up: ${commissionsCleanedUp}`
      });
    } catch (error) {
      console.error('Error during manual cleanup:', error);
      await interaction.editReply('An error occurred during cleanup.');
    }
  }

  /**
   * Handle the stats command (admin only)
   */
  async handleStatsCommand(interaction) {
    // Check if user is admin
    if (!interaction.member.roles.cache.has(this.config.discord.adminRoleId)) {
      return interaction.reply({
        content: 'You don\'t have permission to use this command.',
        ephemeral: true
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const vettingStats = await this.getVettingStats();
      const commissionStats = await this.getCommissionStats();

      const statsMessage = `**Bot Statistics**

**Vettings:**
• Total: ${vettingStats.total}
• Pending: ${vettingStats.pending}
• Approved: ${vettingStats.approved}
• Denied: ${vettingStats.denied}

**Commissions:**
• Total: ${commissionStats.total}
• Active: ${commissionStats.active}
• Inactive: ${commissionStats.inactive}
• Total Reps: ${commissionStats.totalReps}`;

      await interaction.editReply(statsMessage);
    } catch (error) {
      console.error('Error getting stats:', error);
      await interaction.editReply('An error occurred while retrieving statistics.');
    }
  }

  /**
   * Get vetting statistics
   */
  async getVettingStats() {
    const allVettings = await this.vettingStorage.values();
    const pendingCount = allVettings.filter(v => v.status === 'pending').length;
    const approvedCount = allVettings.filter(v => v.status === 'approved').length;
    const deniedCount = allVettings.filter(v => v.status === 'denied').length;

    return {
      total: allVettings.length,
      pending: pendingCount,
      approved: approvedCount,
      denied: deniedCount
    };
  }

  /**
   * Get commission statistics
   */
  async getCommissionStats() {
    const allCommissions = await this.commissionStorage.values();
    const activeCount = allCommissions.filter(c => c.status === 'active').length;
    const inactiveCount = allCommissions.filter(c => c.status === 'inactive').length;
    const totalReps = allCommissions.reduce((sum, c) => sum + c.reps.length, 0);

    return {
      total: allCommissions.length,
      active: activeCount,
      inactive: inactiveCount,
      totalReps
    };
  }

  /**
   * Display storage statistics on startup
   */
  async displayStorageStats() {
    try {
      const vettingStats = await this.getVettingStats();
      const commissionStats = await this.getCommissionStats();

      console.log('=== Bot Storage Statistics ===');
      console.log(`Vettings - Total: ${vettingStats.total}, Pending: ${vettingStats.pending}, Approved: ${vettingStats.approved}, Denied: ${vettingStats.denied}`);
      console.log(`Commissions - Total: ${commissionStats.total}, Active: ${commissionStats.active}, Inactive: ${commissionStats.inactive}, Total Reps: ${commissionStats.totalReps}`);
      console.log('==============================');
    } catch (error) {
      console.error('Error displaying storage stats:', error);
    }
  }

  /**
   * Clean up old vetting and commission sessions using storage cleanup methods
   */
  async cleanupOldSessions() {
    try {
      console.log('Starting scheduled cleanup...');
      
      const vettingsCleanedUp = await this.vettingStorage.cleanup();
      const commissionsCleanedUp = await this.commissionStorage.cleanup();

      if (vettingsCleanedUp > 0 || commissionsCleanedUp > 0) {
        console.log(`Cleanup complete: ${vettingsCleanedUp} vettings, ${commissionsCleanedUp} commissions removed`);
      } else {
        console.log('Cleanup complete: No old records to remove');
      }
    } catch (error) {
      console.error('Error during scheduled cleanup:', error);
    }
  }

  /**
   * Handle bot shutdown and cleanup orphaned channels
   */
  async handleShutdownCleanup() {
    console.log('Performing shutdown cleanup...');
    
    try {
      // Get all pending vettings and mark channels for cleanup
      const pendingVettings = await this.vettingStorage.filter(v => v.status === 'pending');
      const activeCommissions = await this.commissionStorage.filter(c => c.status === 'active');

      console.log(`Found ${pendingVettings.length} pending vettings and ${activeCommissions.length} active commissions on shutdown`);

      // In a real implementation, you might want to:
      // 1. Send notifications about pending items
      // 2. Mark items as interrupted
      // 3. Log state for manual review
      
    } catch (error) {
      console.error('Error during shutdown cleanup:', error);
    }
  }

  /**
   * Start the Discord bot
   */
  async start() {
    try {
      console.log('Starting Discord bot...');
      await this.client.login(this.config.discord.token);
    } catch (error) {
      console.error('Failed to start bot:', error);
      throw error;
    }
  }

  /**
   * Gracefully shutdown the bot
   */
  async shutdown() {
    console.log('Shutting down bot...');
    
    try {
      await this.handleShutdownCleanup();
    } catch (error) {
      console.error('Error during shutdown cleanup:', error);
    }
    
    this.client.destroy();
    process.exit(0);
  }
}

module.exports = VettingBot;
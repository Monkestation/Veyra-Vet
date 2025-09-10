const { Client, GatewayIntentBits } = require('discord.js');
const VeyraAPI = require('./VeyraAPI');
const { registerSlashCommands } = require('./slashCommands');
const { handleVetCommand, handleVetStatusCommand, handleVetListCommand } = require('./commandHandlers');
const { handleVettingDecision } = require('./vettingHandler');
// Add commission imports
const { handleCreateCommissionCommand, handleRepCommand, handleRenameCommissionCommand } = require('./commissionHandlers');

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
    this.activeVettings = new Map(); // Store active vetting sessions
    this.activeCommissions = new Map(); // Store active commission sessions
    
    this.setupEventHandlers();
  }

  /**
   * Set up Discord client event handlers
   */
  setupEventHandlers() {
    this.client.once('ready', () => {
      console.log(`Bot logged in as ${this.client.user.tag}`);
      this.api.login().catch(console.error);
      registerSlashCommands(this.config).catch(console.error);

      // Start cleanup scheduler (run every 24 hours)
      setInterval(() => {
        this.cleanupOldSessions();
      }, 24 * 60 * 60 * 1000);
    });

    this.client.on('interactionCreate', async (interaction) => {
      if (interaction.isChatInputCommand()) {
        await this.handleSlashCommand(interaction);
      } else if (interaction.isButton()) {
        if (interaction.customId.startsWith('approve_') || interaction.customId.startsWith('deny_')) {
          await handleVettingDecision(interaction, this.api, this.activeVettings, this.config);
        }
      }
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
          await handleVetCommand(interaction, this.api, this.activeVettings, this.config);
          break;
        case 'vetstatus':
          await handleVetStatusCommand(interaction, this.activeVettings);
          break;
        case 'vetlist':
          await handleVetListCommand(interaction, this.activeVettings, this.config);
          break;

        // Commission commands
        case 'create-commission':
          await handleCreateCommissionCommand(interaction, this.activeCommissions, this.config);
          break;
        case 'rep':
          await handleRepCommand(interaction, this.activeCommissions);
          break;
        case 'rename-commission':
          await handleRenameCommissionCommand(interaction, this.activeCommissions, this.config);
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

  /**
   * Clean up old vetting and commission sessions
   */
  cleanupOldSessions() {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    let vettingsCleanedUp = 0;
    let commissionsCleanedUp = 0;

    // Cleanup old vettings (approved/denied older than 1 month)
    for (const [id, vetting] of this.activeVettings.entries()) {
      if ((vetting.status === 'approved' || vetting.status === 'denied') && 
          vetting.createdAt < oneMonthAgo) {
        this.activeVettings.delete(id);
        vettingsCleanedUp++;
      }
    }

    // Cleanup old commissions (inactive older than 1 week)
    for (const [id, commission] of this.activeCommissions.entries()) {
      if (commission.status === 'inactive' && commission.createdAt < oneWeekAgo) {
        this.activeCommissions.delete(id);
        commissionsCleanedUp++;
      }
    }

    if (vettingsCleanedUp > 0 || commissionsCleanedUp > 0) {
      console.log(`Cleanup complete: ${vettingsCleanedUp} vettings, ${commissionsCleanedUp} commissions removed`);
    }
  }

  /**
   * Start the Discord bot
   */
  async start() {
    try {
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
    this.client.destroy();
  }
}

module.exports = VettingBot;
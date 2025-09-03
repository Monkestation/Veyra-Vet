const { Client, GatewayIntentBits } = require('discord.js');
const VeyraAPI = require('./VeyraAPI');
const { registerSlashCommands } = require('./slashCommands');
const { handleVetCommand, handleVetStatusCommand, handleVetListCommand } = require('./commandHandlers');
const { handleVettingDecision } = require('./vettingHandler');

/**
 * Main Discord bot class for handling age vetting
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
        case 'vet':
          await handleVetCommand(interaction, this.api, this.activeVettings, this.config);
          break;
        case 'vetstatus':
          await handleVetStatusCommand(interaction, this.activeVettings);
          break;
        case 'vetlist':
          await handleVetListCommand(interaction, this.activeVettings, this.config);
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
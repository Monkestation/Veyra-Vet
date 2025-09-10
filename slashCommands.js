const { SlashCommandBuilder, REST, Routes } = require('discord.js');

/**
 * Define all slash commands for the bot
 */
function getSlashCommands() {
  return [
    // Existing vetting commands
    new SlashCommandBuilder()
      .setName('vet')
      .setDescription('Request vetting for a ckey')
      .addStringOption(option =>
        option
          .setName('ckey')
          .setDescription('Your BYOND ckey')
          .setRequired(true)
      ),
   
    new SlashCommandBuilder()
      .setName('vetstatus')
      .setDescription('Check the status of your vetting request'),
   
    new SlashCommandBuilder()
      .setName('vetlist')
      .setDescription('List all pending vetting requests (Admin only)'),

    // New commission commands
    new SlashCommandBuilder()
      .setName('create-commission')
      .setDescription('Create a new art commission channel')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('Name for your commission channel')
          .setRequired(true)
          .setMaxLength(50)
      ),

    new SlashCommandBuilder()
      .setName('rep')
      .setDescription('Add yourself as a rep for the artist in this commission channel'),

    new SlashCommandBuilder()
      .setName('rename-commission')
      .setDescription('Rename your commission channel (creator only)')
      .addStringOption(option =>
        option
          .setName('name')
          .setDescription('New name for your commission channel')
          .setRequired(true)
          .setMaxLength(50)
      )
  ];
}

/**
 * Register slash commands with Discord
 */
async function registerSlashCommands(config) {
  const commands = getSlashCommands();
  const rest = new REST().setToken(config.discord.token);

  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands }
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error registering slash commands:', error);
    throw error;
  }
}

module.exports = {
  getSlashCommands,
  registerSlashCommands
};
const { SlashCommandBuilder, REST, Routes } = require('discord.js');

/**
 * Define all slash commands for the bot
 */
function getSlashCommands() {
  return [
    new SlashCommandBuilder()
      .setName('vet')
      .setDescription('Request age vetting for a ckey')
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
      .setDescription('List all pending vetting requests (Admin only)')
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
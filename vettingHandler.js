const { EmbedBuilder } = require('discord.js');
const { createVettingChannel, sendVettingEmbed } = require('./channelUtils');
const { 
  handleCreateCommissionCommand, 
  handleRepCommand, 
  handleRenameCommissionCommand 
} = require('./commissionHandlers');

/**
 * Handle the /vet slash command
 */
async function handleVetCommand(interaction, api, activeVettings, config) {
  const ckey = interaction.options.getString('ckey').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const userId = interaction.user.id;

  // Check if user already has an active vetting
  const existingVetting = Array.from(activeVettings.values())
    .find(v => v.userId === userId && v.status === 'pending');
  
  if (existingVetting) {
    return interaction.reply({
      content: `You already have an active vetting request in <#${existingVetting.channelId}>`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Check if ckey already exists in the system
    const existingVerification = await api.getVerificationByCkey(ckey);
    if (existingVerification && existingVerification.verified_flags.age_vetted) {
      return interaction.editReply(`The ckey "${ckey}" is already age-vetted.`);
    }

    // Create the vetting channel
    const vettingChannel = await createVettingChannel(interaction.guild, interaction.user, ckey, config);
    
    // Store the vetting session
    const vettingId = `${userId}-${Date.now()}`;
    activeVettings.set(vettingId, {
      id: vettingId,
      userId: userId,
      ckey: ckey,
      channelId: vettingChannel.id,
      status: 'pending',
      createdAt: new Date()
    });

    // Send initial message to the vetting channel
    await sendVettingEmbed(vettingChannel, interaction.user, ckey, vettingId, config);

    // Reply to the interaction
    await interaction.editReply(`Vetting request created! Please proceed to <#${vettingChannel.id}>`);

  } catch (error) {
    console.error('Error handling vet command:', error);
    await interaction.editReply('An error occurred while creating your vetting request. Please try again.');
  }
}

/**
 * Handle the /vetstatus slash command
 */
async function handleVetStatusCommand(interaction, activeVettings) {
  const userId = interaction.user.id;
  const userVetting = Array.from(activeVettings.values())
    .find(v => v.userId === userId);

  if (!userVetting) {
    return interaction.reply({
      content: 'You don\'t have any active vetting requests.',
      ephemeral: true
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Your Vetting Status')
    .addFields(
      { name: 'Ckey', value: `\`${userVetting.ckey}\``, inline: true },
      { name: 'Status', value: userVetting.status, inline: true },
      { name: 'Channel', value: `<#${userVetting.channelId}>`, inline: true },
      { name: 'Created', value: `<t:${Math.floor(userVetting.createdAt.getTime() / 1000)}:R>`, inline: true }
    )
    .setColor(userVetting.status === 'pending' ? 0xf39c12 : userVetting.status === 'approved' ? 0x27ae60 : 0xe74c3c)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Handle the /vetlist slash command (admin only)
 */
async function handleVetListCommand(interaction, activeVettings, config) {
  // Check if user is admin
  if (!interaction.member.roles.cache.has(config.discord.adminRoleId)) {
    return interaction.reply({
      content: 'You don\'t have permission to use this command.',
      ephemeral: true
    });
  }

  const pendingVettings = Array.from(activeVettings.values())
    .filter(v => v.status === 'pending')
    .sort((a, b) => a.createdAt - b.createdAt);

  if (pendingVettings.length === 0) {
    return interaction.reply({
      content: 'No pending vetting requests.',
      ephemeral: true
    });
  }

  const embed = new EmbedBuilder()
    .setTitle('Pending Vetting Requests')
    .setColor(0x3498db)
    .setTimestamp();

  const description = pendingVettings.map((vetting, index) => {
    const user = interaction.guild.members.cache.get(vetting.userId);
    return `**${index + 1}.** ${user ? user.displayName : 'Unknown User'} - \`${vetting.ckey}\` - <#${vetting.channelId}>`;
  }).join('\n');

  embed.setDescription(description || 'No pending requests');

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

/**
 * Main command router for all slash commands
 */
async function handleSlashCommand(interaction, api, config) {
  const { commandName } = interaction;

  switch (commandName) {
    // Vetting commands
    case 'vet':
      return handleVetCommand(interaction, api, config);
    case 'vetstatus':
      return handleVetStatusCommand(interaction);
    case 'vetlist':
      return handleVetListCommand(interaction, config);

    // Commission commands
    case 'create-commission':
      return handleCreateCommissionCommand(interaction, config);
    case 'rep':
      return handleRepCommand(interaction);
    case 'rename-commission':
      return handleRenameCommissionCommand(interaction, config);

    default:
      return interaction.reply({
        content: 'Unknown command.',
        ephemeral: true
      });
  }
}

module.exports = {
  handleVetCommand,
  handleVetStatusCommand,
  handleVetListCommand,
  handleSlashCommand,
  // Re-export commission handlers for direct access if needed
  handleCreateCommissionCommand,
  handleRepCommand,
  handleRenameCommissionCommand
};
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Handle approval or denial of vetting requests
 */
async function handleVettingDecision(interaction, api, activeVettings, config) {
  // Check if user is admin
  if (!interaction.member.roles.cache.has(config.discord.adminRoleId)) {
    return interaction.reply({
      content: 'You don\'t have permission to approve/deny vetting requests.',
      ephemeral: true
    });
  }

  const [action, vettingId] = interaction.customId.split('_');
  const vetting = activeVettings.get(vettingId);

  if (!vetting) {
    return interaction.reply({
      content: 'This vetting request no longer exists or has already been processed.',
      ephemeral: true
    });
  }

  if (vetting.status !== 'pending') {
    return interaction.reply({
      content: 'This vetting request has already been processed.',
      ephemeral: true
    });
  }

  await interaction.deferReply();

  try {
    const user = await interaction.guild.members.fetch(vetting.userId);
    
    if (action === 'approve') {
      await handleApproval(interaction, api, vetting, user, vettingId, activeVettings);
    } else if (action === 'deny') {
      await handleDenial(interaction, vetting, user, vettingId, activeVettings);
    }

    // Disable buttons on original message
    await disableVettingButtons(interaction, vettingId);

  } catch (error) {
    console.error('Error processing vetting decision:', error);
    await interaction.editReply('An error occurred while processing the vetting decision.');
  }
}

/**
 * Handle vetting approval
 */
async function handleApproval(interaction, api, vetting, user, vettingId, activeVettings) {
  // Update vetting status
  vetting.status = 'approved';
  vetting.approvedBy = interaction.user.id;
  vetting.approvedAt = new Date();

  // Update Veyra backend
  await api.createOrUpdateVerification(
    vetting.userId, 
    vetting.ckey, 
    { 
      vetted: true, 
      vetted_by: interaction.user.id 
    }
  );

  // Send success message
  const successEmbed = new EmbedBuilder()
    .setTitle('Vetting Approved')
    .setDescription(`${user} has been approved for age vetting.`)
    .addFields(
      { name: 'Ckey', value: `\`${vetting.ckey}\``, inline: true },
      { name: 'Approved by', value: `${interaction.user}`, inline: true },
      { name: 'Approved at', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setColor(0x27ae60)
    .setTimestamp();

  await interaction.editReply({ embeds: [successEmbed] });

  // Notify the user
  try {
    await user.send(`Your age vetting request for ckey \`${vetting.ckey}\` has been approved!`);
  } catch (error) {
    console.log('Could not DM user about approval');
  }

  // Schedule channel deletion
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
      activeVettings.delete(vettingId);
    } catch (error) {
      console.error('Error deleting vetting channel:', error);
    }
  }, 30000); // Delete after 30 seconds
}

/**
 * Handle vetting denial
 */
async function handleDenial(interaction, vetting, user, vettingId, activeVettings) {
  // Update vetting status
  vetting.status = 'denied';
  vetting.deniedBy = interaction.user.id;
  vetting.deniedAt = new Date();

  const denialEmbed = new EmbedBuilder()
    .setTitle('Vetting Denied')
    .setDescription(`${user}'s vetting request has been denied.`)
    .addFields(
      { name: 'Ckey', value: `\`${vetting.ckey}\``, inline: true },
      { name: 'Denied by', value: `${interaction.user}`, inline: true },
      { name: 'Denied at', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      { name: 'Note', value: 'User can submit a new vetting request if needed.', inline: false }
    )
    .setColor(0xe74c3c)
    .setTimestamp();

  await interaction.editReply({ embeds: [denialEmbed] });

  // Notify the user
  try {
    await user.send(`Your age vetting request for ckey \`${vetting.ckey}\` has been denied. You may submit a new request with proper documentation if needed.`);
  } catch (error) {
    console.log('Could not DM user about denial');
  }

  // Schedule channel deletion
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
      activeVettings.delete(vettingId);
    } catch (error) {
      console.error('Error deleting vetting channel:', error);
    }
  }, 60000); // Delete after 1 minute for denials
}

/**
 * Disable the approve/deny buttons on the original vetting message
 */
async function disableVettingButtons(interaction, vettingId) {
  const disabledRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${vettingId}`)
        .setLabel('Approved')
        .setStyle(ButtonStyle.Success)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`deny_${vettingId}`)
        .setLabel('Denied')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(true)
    );

  // Update the original message
  const originalMessage = await interaction.channel.messages.fetch({ limit: 50 });
  const vettingMessage = originalMessage.find(msg => 
    msg.embeds.length > 0 && 
    msg.embeds[0].footer && 
    msg.embeds[0].footer.text.includes(vettingId)
  );

  if (vettingMessage) {
    await vettingMessage.edit({ components: [disabledRow] });
  }
}

module.exports = {
  handleVettingDecision
};
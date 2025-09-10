const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { vettingStorage } = require('./persistantStorage'); // Import the storage

/**
 * Handle approval or denial of vetting requests
 */
async function handleVettingDecision(interaction, api, config) {
  // Check if user is admin
  if (!interaction.member.roles.cache.has(config.discord.adminRoleId)) {
    return interaction.reply({
      content: 'You don\'t have permission to approve/deny vetting requests.',
      ephemeral: true
    });
  }

  const [action, vettingId] = interaction.customId.split('_');
  
  // Get vetting from storage
  const vetting = await vettingStorage.get(vettingId);

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
      await handleApproval(interaction, api, vetting, user, vettingId);
    } else if (action === 'deny') {
      await handleDenial(interaction, vetting, user, vettingId);
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
async function handleApproval(interaction, api, vetting, user, vettingId) {
  // Update vetting status in storage
  await vettingStorage.updateStatus(vettingId, 'approved', interaction.user.id);

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
    .setDescription(`${user} has been approved for verification.`)
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
    await user.send(`Your vetting request for ckey \`${vetting.ckey}\` has been approved, you can now run /verify {ckey} to verify your ID!`);
  } catch (error) {
    console.log('Could not DM user about approval');
  }

  // Schedule channel deletion
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
      // Note: Don't delete from storage yet - cleanup will handle old approved records
    } catch (error) {
      console.error('Error deleting vetting channel:', error);
    }
  }, 30000); // Delete after 30 seconds
}

/**
 * Handle vetting denial
 */
async function handleDenial(interaction, vetting, user, vettingId) {
  // Update vetting status in storage
  await vettingStorage.updateStatus(vettingId, 'denied', interaction.user.id);

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
    await user.send(`Your vetting request for ckey \`${vetting.ckey}\` has been denied. You may submit a new request with proper documentation if needed.`);
  } catch (error) {
    console.log('Could not DM user about denial');
  }

  // Schedule channel deletion
  setTimeout(async () => {
    try {
      await interaction.channel.delete();
      // Note: Don't delete from storage yet - cleanup will handle old denied records
    } catch (error) {
      console.error('Error deleting vetting channel:', error);
    }
  }, 60000); // Delete after 1 minute for denials
}

/**
 * Create a new vetting request
 */
async function createVettingRequest(userId, ckey, evidence, channelId) {
  // Check if user already has a pending vetting request
  const existingVetting = await vettingStorage.getByUserId(userId);
  
  if (existingVetting) {
    throw new Error('User already has a pending vetting request');
  }

  const vettingId = `${userId}-${Date.now()}`;
  const vettingData = {
    id: vettingId,
    userId: userId,
    ckey: ckey,
    evidence: evidence,
    channelId: channelId,
    status: 'pending',
    createdAt: new Date()
  };

  await vettingStorage.set(vettingId, vettingData);
  return vettingData;
}

/**
 * Get all pending vetting requests
 */
async function getPendingVettings() {
  return await vettingStorage.getPendingVettings();
}

/**
 * Get vetting statistics
 */
async function getVettingStats() {
  const allVettings = await vettingStorage.values();
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
 * Clean up old vetting records
 */
async function cleanupOldVettings() {
  return await vettingStorage.cleanup();
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

/**
 * Create vetting embed with buttons
 */
async function createVettingEmbed(guild, vetting) {
  const user = await guild.members.fetch(vetting.userId);
  
  const embed = new EmbedBuilder()
    .setTitle('New Vetting Request')
    .setDescription(`${user} has submitted a vetting request.`)
    .addFields(
      { name: 'User', value: `${user} (${user.user.tag})`, inline: true },
      { name: 'Ckey', value: `\`${vetting.ckey}\``, inline: true },
      { name: 'Submitted', value: `<t:${Math.floor(vetting.createdAt.getTime() / 1000)}:R>`, inline: true },
      { name: 'Evidence', value: vetting.evidence || 'No evidence provided', inline: false }
    )
    .setColor(0xf39c12)
    .setThumbnail(user.user.displayAvatarURL())
    .setFooter({ text: `Vetting ID: ${vetting.id}` })
    .setTimestamp();

  const row = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${vetting.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${vetting.id}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

  return { embeds: [embed], components: [row] };
}

/**
 * Handle vetting request timeout (auto-deny after X days)
 */
async function handleVettingTimeout(vettingId, timeoutDays = 7) {
  const vetting = await vettingStorage.get(vettingId);
  
  if (!vetting || vetting.status !== 'pending') {
    return false; // Already processed or doesn't exist
  }

  const timeoutDate = new Date(vetting.createdAt.getTime() + (timeoutDays * 24 * 60 * 60 * 1000));
  
  if (new Date() > timeoutDate) {
    await vettingStorage.updateStatus(vettingId, 'timeout');
    return true; // Timed out
  }
  
  return false; // Not timed out yet
}

module.exports = {
  handleVettingDecision,
  createVettingRequest,
  getPendingVettings,
  getVettingStats,
  cleanupOldVettings,
  createVettingEmbed,
  handleVettingTimeout
};
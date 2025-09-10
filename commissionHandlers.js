const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

/**
 * Handle the /create-commission slash command
 */
async function handleCreateCommissionCommand(interaction, activeCommissions, config) {
  const channelName = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-_]/g, '');
  const userId = interaction.user.id;

  // Check if user already has an active commission channel
  const existingCommission = Array.from(activeCommissions.values())
    .find(c => c.creatorId === userId && c.status === 'active');
  
  if (existingCommission) {
    return interaction.reply({
      content: `You already have an active commission channel: <#${existingCommission.channelId}>`,
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Create the commission channel
    const commissionChannel = await createCommissionChannel(interaction.guild, interaction.user, channelName, config);
    
    // Create the initial artwork thread
    const artworkThread = await commissionChannel.threads.create({
      name: 'artwork',
      type: ChannelType.PrivateThread,
      reason: 'Initial artwork thread for commission channel'
    });

    // Store the commission session
    const commissionId = `${userId}-${Date.now()}`;
    activeCommissions.set(commissionId, {
      id: commissionId,
      creatorId: userId,
      channelId: commissionChannel.id,
      channelName: channelName,
      artworkThreadId: artworkThread.id,
      reps: [],
      status: 'active',
      createdAt: new Date()
    });

    // Send initial embed to the commission channel
    await sendCommissionEmbed(commissionChannel, interaction.user, channelName, commissionId, []);

    // Reply to the interaction
    await interaction.editReply(`Commission channel created! You can now manage your commissions in <#${commissionChannel.id}>`);

  } catch (error) {
    console.error('Error handling create-commission command:', error);
    await interaction.editReply('An error occurred while creating your commission channel. Please try again.');
  }
}

/**
 * Handle the /rep slash command
 */
async function handleRepCommand(interaction, activeCommissions) {
  const userId = interaction.user.id;
  const channelId = interaction.channel.id;

  // Find the commission for this channel
  const commission = Array.from(activeCommissions.values())
    .find(c => c.channelId === channelId);

  if (!commission) {
    return interaction.reply({
      content: 'This command can only be used in commission channels.',
      ephemeral: true
    });
  }

  // Check if user is already a rep
  if (commission.reps.includes(userId)) {
    return interaction.reply({
      content: 'You are already registered as a rep for this artist.',
      ephemeral: true
    });
  }

  // Add user to reps list
  commission.reps.push(userId);

  // Update the commission embed
  await updateCommissionEmbed(interaction.channel, commission, interaction.guild);

  await interaction.reply({
    content: 'You have been added as a rep for this artist!',
    ephemeral: true
  });
}

/**
 * Handle the /rename-commission slash command
 */
async function handleRenameCommissionCommand(interaction, activeCommissions, config) {
  const newName = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-_]/g, '');
  const userId = interaction.user.id;
  const channelId = interaction.channel.id;

  // Find the commission for this channel
  const commission = Array.from(activeCommissions.values())
    .find(c => c.channelId === channelId);

  if (!commission) {
    return interaction.reply({
      content: 'This command can only be used in commission channels.',
      ephemeral: true
    });
  }

  // Check if user is the creator of the commission
  if (commission.creatorId !== userId) {
    return interaction.reply({
      content: 'Only the commission creator can rename the channel.',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Rename the channel
    const formattedName = `commission-${newName}`;
    await interaction.channel.setName(formattedName);
    
    // Update the commission data
    commission.channelName = newName;

    // Update the commission embed
    await updateCommissionEmbed(interaction.channel, commission, interaction.guild);

    await interaction.editReply(`Channel renamed to "${formattedName}" successfully!`);

  } catch (error) {
    console.error('Error handling rename-commission command:', error);
    await interaction.editReply('An error occurred while renaming the commission channel. Please try again.');
  }
}

/**
 * Create a commission channel for the user
 */
async function createCommissionChannel(guild, user, channelName, config) {
  const formattedChannelName = `commission-${channelName}`;
  
  const channel = await guild.channels.create({
    name: formattedChannelName,
    type: ChannelType.GuildText,
    parent: config.discord.commissionCategoryId || null,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.SendMessages],
        allow: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.CreatePrivateThreads,
          PermissionFlagsBits.CreatePublicThreads,
          PermissionFlagsBits.SendMessagesInThreads
        ]
      }
    ]
  });

  return channel;
}

/**
 * Send the initial commission embed
 */
async function sendCommissionEmbed(channel, user, channelName, commissionId, reps) {
  const embed = new EmbedBuilder()
    .setTitle(`Commission: ${channelName}`)
    .setDescription(`Welcome to ${user.displayName}'s commission channel!`)
    .addFields(
      { name: 'Artist', value: `${user} (${user.tag})`, inline: true },
      { name: 'Commission Name', value: `\`${channelName}\``, inline: true },
      { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
      { name: 'Reps', value: reps.length > 0 ? reps.map(id => `<@${id}>`).join('\n') : 'No reps yet', inline: false }
    )
    .setColor(0x9b59b6)
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: `Commission ID: ${commissionId}` });

  const message = await channel.send({
    embeds: [embed]
  });

  // Pin the message
  await message.pin();

  return message;
}

/**
 * Update the commission embed with new rep information
 */
async function updateCommissionEmbed(channel, commission, guild) {
  try {
    // Get the pinned messages to find our embed
    const pinnedMessages = await channel.messages.fetchPinned();
    const embedMessage = pinnedMessages.find(msg => 
      msg.embeds.length > 0 && 
      msg.embeds[0].footer?.text?.includes(commission.id)
    );

    if (!embedMessage) {
      console.log('Could not find commission embed to update');
      return;
    }

    const user = await guild.members.fetch(commission.creatorId);
    
    const embed = new EmbedBuilder()
      .setTitle(`Commission: ${commission.channelName}`)
      .setDescription(`Welcome to ${user.displayName}'s commission channel!`)
      .addFields(
        { name: 'Artist', value: `${user} (${user.user.tag})`, inline: true },
        { name: 'Commission Name', value: `\`${commission.channelName}\``, inline: true },
        { name: 'Created', value: `<t:${Math.floor(commission.createdAt.getTime() / 1000)}:R>`, inline: true },
        { name: 'Reps', value: commission.reps.length > 0 ? commission.reps.map(id => `<@${id}>`).join('\n') : 'No reps yet', inline: false }
      )
      .setColor(0x9b59b6)
      .setThumbnail(user.user.displayAvatarURL())
      .setFooter({ text: `Commission ID: ${commission.id}` });

    await embedMessage.edit({ embeds: [embed] });

  } catch (error) {
    console.error('Error updating commission embed:', error);
  }
}

module.exports = {
  handleCreateCommissionCommand,
  handleRepCommand,
  handleRenameCommissionCommand,
  createCommissionChannel,
  sendCommissionEmbed,
  updateCommissionEmbed
};
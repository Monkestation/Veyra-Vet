const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { commissionStorage } = require('./persistantStorage'); // Import the storage

/**
 * Handle the /create-commission slash command
 */
async function handleCreateCommissionCommand(interaction, config) {
  const channelName = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-_]/g, '');
  const userId = interaction.user.id;

  // Check if user already has an active commission channel using storage
  const existingCommission = await commissionStorage.getByCreatorId(userId);
  
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

    // Store the commission session in persistent storage
    const commissionId = `${userId}-${Date.now()}`;
    const commissionData = {
      id: commissionId,
      creatorId: userId,
      channelId: commissionChannel.id,
      channelName: channelName,
      artworkThreadId: artworkThread.id,
      reps: [],
      status: 'active',
      createdAt: new Date()
    };
    
    await commissionStorage.set(commissionId, commissionData);

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
async function handleRepCommand(interaction) {
  const userId = interaction.user.id;
  const channelId = interaction.channel.id;

  // Find the commission for this channel using storage
  const commission = await commissionStorage.getByChannelId(channelId);

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

  // Add user to reps list using storage method
  const added = await commissionStorage.addRep(channelId, userId);
  
  if (!added) {
    return interaction.reply({
      content: 'Failed to add you as a rep. Please try again.',
      ephemeral: true
    });
  }

  // Get updated commission data
  const updatedCommission = await commissionStorage.getByChannelId(channelId);

  // Update the commission embed
  await updateCommissionEmbed(interaction.channel, updatedCommission, interaction.guild);

  await interaction.reply({
    content: 'You have been added as a rep for this artist!',
    ephemeral: true
  });
}

/**
 * Handle the /rename-commission slash command
 */
async function handleRenameCommissionCommand(interaction, config) {
  const newName = interaction.options.getString('name').toLowerCase().replace(/[^a-z0-9-_]/g, '');
  const userId = interaction.user.id;
  const channelId = interaction.channel.id;

  // Find the commission for this channel using storage
  const commission = await commissionStorage.getByChannelId(channelId);

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
    const formattedName = `${newName}`;
    await interaction.channel.setName(formattedName);
    
    // Update the commission data using storage method
    const updatedCommission = await commissionStorage.updateChannelName(channelId, newName);

    if (updatedCommission) {
      // Update the commission embed
      await updateCommissionEmbed(interaction.channel, updatedCommission, interaction.guild);
    }

    await interaction.editReply(`Channel renamed to "${formattedName}" successfully!`);

  } catch (error) {
    console.error('Error handling rename-commission command:', error);
    await interaction.editReply('An error occurred while renaming the commission channel. Please try again.');
  }
}

/**
 * Handle the /close-commission slash command
 */
async function handleCloseCommissionCommand(interaction) {
  const userId = interaction.user.id;
  const channelId = interaction.channel.id;

  // Find the commission for this channel using storage
  const commission = await commissionStorage.getByChannelId(channelId);

  if (!commission) {
    return interaction.reply({
      content: 'This command can only be used in commission channels.',
      ephemeral: true
    });
  }

  // Check if user is the creator of the commission
  if (commission.creatorId !== userId) {
    return interaction.reply({
      content: 'Only the commission creator can close the channel.',
      ephemeral: true
    });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    // Set commission status to inactive
    await commissionStorage.setStatus(channelId, 'inactive');
    
    // Send notification to the channel
    const embed = new EmbedBuilder()
      .setTitle('Commission Closed')
      .setDescription('This art stall has been closed by the artist.')
      .setColor(0xff6b6b)
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
    
    await interaction.editReply('Art Stall closed successfully. This channel will be cleaned up automatically during the next cleanup cycle.');
     // Schedule channel deletion
    setTimeout(async () => {
      try {
        await interaction.channel.delete();
        // Note: Don't delete from storage yet - cleanup will handle old approved records
      } catch (error) {
        console.error('Error deleting vetting channel:', error);
      }
    }, 30000); // Delete after 30 seconds

  } catch (error) {
    console.error('Error handling close-commission command:', error);
    await interaction.editReply('An error occurred while closing the commission channel. Please try again.');
  }
}

/**
 * Handle commission cleanup (inactive channels)
 */
async function handleCommissionCleanup(interaction) {
  const channelId = interaction.channel.id;
  
  // Set commission status to inactive
  await commissionStorage.setStatus(channelId, 'inactive');
  
  await interaction.reply({
    content: 'Commission marked as inactive. Channel will be cleaned up automatically.',
    ephemeral: true
  });
}

/**
 * Remove a rep from a commission
 */
async function handleRemoveRep(interaction, targetUserId) {
  const channelId = interaction.channel.id;
  const userId = interaction.user.id;

  // Find the commission for this channel
  const commission = await commissionStorage.getByChannelId(channelId);

  if (!commission) {
    return interaction.reply({
      content: 'This command can only be used in commission channels.',
      ephemeral: true
    });
  }

  // Check if user is the creator of the commission or the target user
  if (commission.creatorId !== userId && targetUserId !== userId) {
    return interaction.reply({
      content: 'Only the commission creator or the rep themselves can remove a rep.',
      ephemeral: true
    });
  }

  // Remove user from reps list using storage method
  const removed = await commissionStorage.removeRep(channelId, targetUserId);
  
  if (!removed) {
    return interaction.reply({
      content: 'User is not currently a rep for this artist.',
      ephemeral: true
    });
  }

  // Get updated commission data
  const updatedCommission = await commissionStorage.getByChannelId(channelId);

  // Update the commission embed
  await updateCommissionEmbed(interaction.channel, updatedCommission, interaction.guild);

  await interaction.reply({
    content: `<@${targetUserId}> has been removed as a rep for this artist.`,
    ephemeral: true
  });
}

/**
 * Create a commission channel for the user
 */
/**
 * Create a commission channel for the user
 */
async function createCommissionChannel(guild, user, channelName, config) {
    const formattedChannelName = `${channelName}`;
    
    const channel = await guild.channels.create({
        name: formattedChannelName,
        type: ChannelType.GuildText,
        parent: config.discord.commissionCategoryId || null,
        permissionOverwrites: [
            {
                id: guild.roles.everyone,
                deny: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages
                ]
            },
            {
                id: config.discord.commissionRoleId, // Add this to your config
                allow: [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.ReadMessageHistory
                ],
                deny: [PermissionFlagsBits.SendMessages]
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

/**
 * Send the initial commission embed with rep button
 */
async function sendCommissionEmbed(channel, user, channelName, commissionId, reps) {
    const embed = new EmbedBuilder()
        .setTitle(`Art Stall: ${channelName}`)
        .setDescription(`Welcome to ${user.displayName}'s art stall!`)
        .addFields(
            { name: 'Artist', value: `${user} (${user.tag})`, inline: true },
            { name: 'Art Stall Name', value: `\`${channelName}\``, inline: true },
            { name: 'Created', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
            { name: 'Reps', value: reps.length > 0 ? reps.map(id => `<@${id}>`).join('\n') : 'No reps yet', inline: false }
        )
        .setColor(0x9b59b6)
        .setThumbnail(user.displayAvatarURL())
        .setFooter({ text: `Commission ID: ${commissionId}` });

    // Create button row
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`rep_add_${commissionId}`)
                .setLabel('Become a Rep')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('📝'),
            new ButtonBuilder()
                .setCustomId(`rep_remove_${commissionId}`)
                .setLabel('Remove Rep')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌')
        );

    const message = await channel.send({
        embeds: [embed],
        components: [row]
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
            .setTitle(`Art Stall: ${commission.channelName}`)
            .setDescription(`Welcome to ${user.displayName}'s art stall!`)
            .addFields(
                { name: 'Artist', value: `${user} (${user.user.tag})`, inline: true },
                { name: 'Art Stall Name', value: `\`${commission.channelName}\``, inline: true },
                { name: 'Created', value: `<t:${Math.floor(commission.createdAt.getTime() / 1000)}:R>`, inline: true },
                { name: 'Reps', value: commission.reps.length > 0 ? commission.reps.map(id => `<@${id}>`).join('\n') : 'No reps yet', inline: false }
            )
            .setColor(0x9b59b6)
            .setThumbnail(user.user.displayAvatarURL())
            .setFooter({ text: `Commission ID: ${commission.id}` });

        // Keep the same buttons
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`rep_add_${commission.id}`)
                    .setLabel('Become a Rep')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('📝'),
                new ButtonBuilder()
                    .setCustomId(`rep_remove_${commission.id}`)
                    .setLabel('Remove Rep')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        await embedMessage.edit({ embeds: [embed], components: [row] });

    } catch (error) {
        console.error('Error updating commission embed:', error);
    }
}

/**
 * Handle rep button interactions
 */
async function handleRepButtonInteraction(interaction) {
    const [action, actionType, commissionId] = interaction.customId.split('_');
    const userId = interaction.user.id;

    if (action !== 'rep') return false; // Not a rep button

    // Find the commission
    const commission = await commissionStorage.get(commissionId);
    if (!commission) {
        return interaction.reply({
            content: 'Commission not found. This may be an old button.',
            ephemeral: true
        });
    }

    if (actionType === 'add') {
        // Check if user is already a rep
        if (commission.reps.includes(userId)) {
            return interaction.reply({
                content: 'You are already registered as a rep for this artist.',
                ephemeral: true
            });
        }

        // Add user to reps list
        const added = await commissionStorage.addRep(commission.channelId, userId);
        
        if (!added) {
            return interaction.reply({
                content: 'Failed to add you as a rep. Please try again.',
                ephemeral: true
            });
        }

        // Get updated commission data
        const updatedCommission = await commissionStorage.get(commissionId);

        // Update the commission embed
        await updateCommissionEmbed(interaction.channel, updatedCommission, interaction.guild);

        await interaction.reply({
            content: 'You have been added as a rep for this artist!',
            ephemeral: true
        });

    } else if (actionType === 'remove') {
        // Check if user is a rep or the commission creator
        if (!commission.reps.includes(userId) && commission.creatorId !== userId) {
            return interaction.reply({
                content: 'You are not currently a rep for this artist.',
                ephemeral: true
            });
        }

        // If user is commission creator, they can remove any rep
        let targetUserId = userId;
        if (commission.creatorId === userId && commission.reps.length > 0) {
            // For simplicity, remove the user themselves if they're a rep, 
            // or you could add a select menu for the creator to choose which rep to remove
            if (!commission.reps.includes(userId)) {
                return interaction.reply({
                    content: 'As the artist, you can only remove yourself if you\'re a rep, or contact an admin to remove specific reps.',
                    ephemeral: true
                });
            }
        }

        // Remove user from reps list
        const removed = await commissionStorage.removeRep(commission.channelId, targetUserId);

        if (!removed) {
            return interaction.reply({
                content: 'You are not currently a rep for this artist.',
                ephemeral: true
            });
        }

        // Get updated commission data
        const updatedCommission = await commissionStorage.get(commissionId);

        // Update the commission embed
        await updateCommissionEmbed(interaction.channel, updatedCommission, interaction.guild);

        await interaction.reply({
            content: 'You have been removed as a rep for this artist.',
            ephemeral: true
        });
    }

    return true; // Handled
}

/**
 * Retroactively add buttons to existing commission embeds
 */
async function addButtonsToExistingCommissions(guild, config) {
    try {
        console.log('Adding buttons to existing commission embeds...');
        
        const allCommissions = await commissionStorage.values();
        const activeCommissions = allCommissions.filter(c => c.status === 'active');
        
        let updatedCount = 0;
        
        for (const commission of activeCommissions) {
            try {
                const channel = await guild.channels.fetch(commission.channelId);
                if (!channel) continue;
                
                const pinnedMessages = await channel.messages.fetchPinned();
                const embedMessage = pinnedMessages.find(msg =>
                    msg.embeds.length > 0 &&
                    msg.embeds[0].footer?.text?.includes(commission.id)
                );
                
                if (embedMessage && (!embedMessage.components || embedMessage.components.length === 0)) {
                    // Message exists but has no buttons, add them
                    const row = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`rep_add_${commission.id}`)
                                .setLabel('Become a Rep')
                                .setStyle(ButtonStyle.Primary)
                                .setEmoji('📝'),
                            new ButtonBuilder()
                                .setCustomId(`rep_remove_${commission.id}`)
                                .setLabel('Remove Rep')
                                .setStyle(ButtonStyle.Danger)
                                .setEmoji('❌')
                        );
                    
                    await embedMessage.edit({
                        embeds: embedMessage.embeds,
                        components: [row]
                    });
                    
                    updatedCount++;
                }
            } catch (error) {
                console.error(`Error updating commission ${commission.id}:`, error);
            }
        }
        
        console.log(`Added buttons to ${updatedCount} existing commission embeds`);
        return updatedCount;
        
    } catch (error) {
        console.error('Error adding buttons to existing commissions:', error);
        return 0;
    }
}

/**
 * Get commission statistics
 */
async function getCommissionStats() {
  const allCommissions = await commissionStorage.values();
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

module.exports = {
  handleCreateCommissionCommand,
  handleRepCommand,
  handleRenameCommissionCommand,
  handleCloseCommissionCommand,
  handleCommissionCleanup,
  handleRemoveRep,
  createCommissionChannel,
  sendCommissionEmbed,
  updateCommissionEmbed,
  getCommissionStats,
  handleRepButtonInteraction,
  addButtonsToExistingCommissions
};
const { PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

/**
 * Create a private vetting channel for the user
 */
async function createVettingChannel(guild, user, ckey, config) {
  const channelName = `vet-${ckey}-${user.username}`.toLowerCase().replace(/[^a-z0-9-_]/g, '');
  
  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: config.discord.vettingCategoryId,
    permissionOverwrites: [
      {
        id: guild.roles.everyone,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      },
      {
        id: config.discord.adminRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels
        ]
      }
    ]
  });

  return channel;
}

/**
 * Send the initial vetting embed with approve/deny buttons
 */
async function sendVettingEmbed(channel, user, ckey, vettingId, config) {
  const embed = new EmbedBuilder()
    .setTitle('Age Vetting Request')
    .setDescription(`A new age vetting request has been submitted.`)
    .addFields(
        { name: 'User', value: `${user} (${user.tag})`, inline: true },
        { name: 'Ckey', value: `\`${ckey}\``, inline: true },
        { name: 'Requested', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true },
        { name: 'Instructions', value: 'In your own words, what does "high roleplay" mean to you?\n\nYour character is offered something they really want, but it goes against their morals. How would you handle this situation in character?\n\nGive a short example of a character concept you would play here. What drives them?\n\nYou are in the middle of roleplay, and another player does something that breaks immersion (metagaming, powergaming, etc.). How do you respond?\n\nWhat is the difference between your characters knowledge and your own knowledge as a player? Can you give an example?', inline: false }
    )
    .setColor(0x3498db)
    .setThumbnail(user.displayAvatarURL())
    .setFooter({ text: `Vetting ID: ${vettingId}` });

  const actionRow = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${vettingId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`deny_${vettingId}`)
        .setLabel('Deny')
        .setStyle(ButtonStyle.Danger)
    );

  await channel.send({ 
    content: `<@&${config.discord.adminRoleId}> New vetting request`,
    embeds: [embed], 
    components: [actionRow] 
  });
}

module.exports = {
  createVettingChannel,
  sendVettingEmbed
};
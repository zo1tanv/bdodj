const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function buildPanel(player) {
  const embed = new EmbedBuilder()
    .setTitle('BDODJ')
    .setColor(0x1db954)
    .setTimestamp();

  if (!player?.currentTrack) {
    const lines = [
      player?.status === 'resolving' ? '**Searching...**' : '**Nothing is playing.**',
      `Queue: **${player?.queue?.length || 0}**`,
    ];
    if (player?.lastError) lines.push('', `Last error: \`${String(player.lastError).slice(0, 180)}\``);
    embed.setDescription(lines.join('\n'));
  } else {
    const track = player.currentTrack;
    embed.setDescription([
      `**Now playing**`,
      `[${track.title}](${track.webpageUrl})`,
      '',
      `Status: **${player.status}**`,
      `Duration: **${track.durationStr || '?:??'}**`,
      `Requested by: ${track.requester?.id ? `<@${track.requester.id}>` : 'unknown'}`,
      `Queue: **${player.queue.length}**`,
    ].join('\n'));
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bdodj_add').setLabel('Add track').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bdodj_queue').setLabel('Queue').setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bdodj_pause').setLabel(player?.isPaused?.() ? 'Resume' : 'Pause').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bdodj_skip').setLabel('Skip').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bdodj_stop').setLabel('Stop').setStyle(ButtonStyle.Danger),
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildQueue(player) {
  const lines = [];
  if (player.currentTrack) lines.push(`Now: [${player.currentTrack.title}](${player.currentTrack.webpageUrl})`);
  if (!player.queue.length) {
    lines.push('Queue is empty.');
  } else {
    lines.push('', ...player.queue.slice(0, 10).map((track, index) =>
      `${index + 1}. [${track.title}](${track.webpageUrl}) - ${track.durationStr || '?:??'}`
    ));
    if (player.queue.length > 10) lines.push(`... and ${player.queue.length - 10} more`);
  }
  return {
    embeds: [new EmbedBuilder().setTitle('BDODJ Queue').setColor(0x5865f2).setDescription(lines.join('\n'))],
  };
}

module.exports = { buildPanel, buildQueue };

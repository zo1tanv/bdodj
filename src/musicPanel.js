const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

function statusView(player) {
  if (!player?.currentTrack) {
    if (player?.status === 'resolving') return { label: 'Ищем трек', color: 0xf1c40f, icon: '🔎' };
    if (player?.status === 'connecting') return { label: 'Подключаемся', color: 0x3498db, icon: '🔌' };
    return { label: 'Свободен', color: 0x2ecc71, icon: '🟢' };
  }
  if (player.isPaused?.()) return { label: 'Пауза', color: 0xf1c40f, icon: '⏸️' };
  if (player.status === 'buffering') return { label: 'Буферизация', color: 0x3498db, icon: '📡' };
  if (player.status === 'connecting') return { label: 'Подключаемся', color: 0x3498db, icon: '🔌' };
  return { label: 'Играет', color: 0x1db954, icon: '▶️' };
}

function clip(value, limit = 120) {
  const text = String(value || '');
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function formatTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, '0');
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${secs}` : `${minutes}:${secs}`;
}

function progressLine(player) {
  if (!player?.currentTrack) return '0:00 / 0:00\n`────────────`';

  const progress = player.getProgress?.() || { elapsedSeconds: 0, durationSeconds: 0, percent: 0, isLive: false };
  if (progress.isLive) return `${formatTime(progress.elapsedSeconds)} / live\n\`LIVE - ON AIR\``;

  const totalBlocks = 18;
  if (progress.durationSeconds <= 0) {
    const marker = progress.elapsedSeconds % totalBlocks;
    const bar = Array.from({ length: totalBlocks }, (_, index) => (index === marker ? '◆' : '─')).join('');
    return `${formatTime(progress.elapsedSeconds)} / ?:??\n\`${bar}\``;
  }

  const marker = Math.min(totalBlocks - 1, Math.max(0, Math.floor(progress.percent * totalBlocks)));
  const bar = Array.from({ length: totalBlocks }, (_, index) => {
    if (index === marker) return '◆';
    return index < marker ? '━' : '─';
  }).join('');

  return `${formatTime(progress.elapsedSeconds)} / ${formatTime(progress.durationSeconds)}\n\`${bar}\``;
}

function queuePreview(player) {
  if (!player?.queue?.length) return 'Очередь пуста';
  const lines = player.queue.slice(0, 6).map((track, index) =>
    `${index + 1}. [${clip(track.title, 70)}](${track.webpageUrl}) · ${track.durationStr || '?:??'}`
  );
  if (player.queue.length > 6) lines.push(`…и ещё ${player.queue.length - 6}`);
  return lines.join('\n');
}

function nowPlaying(player) {
  const track = player?.currentTrack;
  if (!track) return 'Нажми **Добавить**, чтобы поставить первый трек.';
  return [
    `[${clip(track.title, 120)}](${track.webpageUrl})`,
    `Заказал: ${track.requester?.id ? `<@${track.requester.id}>` : 'неизвестно'}`,
  ].join('\n');
}

function buildPanel(player) {
  const status = statusView(player);
  const embed = new EmbedBuilder()
    .setTitle('BDODJ Music Panel')
    .setColor(status.color)
    .setDescription(`${status.icon} **${status.label}**`)
    .addFields(
      { name: 'Сейчас', value: nowPlaying(player) },
      { name: 'Прогресс', value: progressLine(player) },
      { name: `Очередь (${player?.queue?.length || 0})`, value: queuePreview(player) },
    )
    .setFooter({ text: player?.voiceChannel ? `Канал: ${player.voiceChannel.name}` : 'BDO Radio' })
    .setTimestamp();

  if (player?.lastError) {
    embed.addFields({ name: 'Последняя ошибка', value: `\`${clip(player.lastError, 180)}\`` });
  }

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bdodj_add').setEmoji('➕').setLabel('Добавить').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bdodj_queue').setEmoji('📜').setLabel('Очередь').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bdodj_pause').setEmoji(player?.isPaused?.() ? '▶️' : '⏸️').setLabel(player?.isPaused?.() ? 'Продолжить' : 'Пауза').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bdodj_skip').setEmoji('⏭️').setLabel('Пропуск').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('bdodj_stop').setEmoji('⏹️').setLabel('Стоп').setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bdodj_recommend').setEmoji('✨').setLabel('Рекомендации').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bdodj_playlists').setEmoji('💿').setLabel('Плейлисты').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bdodj_shuffle').setEmoji('🔀').setLabel('Перемешать').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bdodj_refresh').setEmoji('🔄').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bdodj_leave').setEmoji('🚪').setLabel('Выйти').setStyle(ButtonStyle.Secondary),
  );

  return { embeds: [embed], components: [row1, row2] };
}

function buildQueue(player) {
  const lines = [];
  if (player.currentTrack) lines.push(`Сейчас: [${player.currentTrack.title}](${player.currentTrack.webpageUrl})`);
  if (!player.queue.length) {
    lines.push('Очередь пуста.');
  } else {
    lines.push('', ...player.queue.slice(0, 12).map((track, index) =>
      `${index + 1}. [${track.title}](${track.webpageUrl}) - ${track.durationStr || '?:??'}`
    ));
    if (player.queue.length > 12) lines.push(`...и ещё ${player.queue.length - 12}`);
  }
  return {
    embeds: [new EmbedBuilder().setTitle('Очередь BDODJ').setColor(0x5865f2).setDescription(lines.join('\n'))],
  };
}

module.exports = { buildPanel, buildQueue };

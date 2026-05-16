const { ActionRowBuilder, Client, Events, GatewayIntentBits, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('./config');
const MusicPlayer = require('./musicPlayer');
const { buildPanel, buildQueue } = require('./musicPanel');
const { deletePanel, getPanel, setPanel } = require('./panelStore');

if (!config.token) {
  console.error('BDODJ_TOKEN or DISCORD_TOKEN is required.');
  process.exit(2);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

const players = new Map();

function playerFor(guildId) {
  let player = players.get(guildId);
  if (!player) {
    player = new MusicPlayer(client, config);
    player.setUpdateHandler(() => refreshStoredPanel(guildId));
    players.set(guildId, player);
  }
  return player;
}

function musicModal() {
  return new ModalBuilder()
    .setCustomId('bdodj_modal_add')
    .setTitle('Добавить трек')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('Ссылка YouTube или название')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

async function fetchStoredPanel(guildId) {
  const panel = getPanel(guildId);
  if (!panel) return null;
  try {
    const channel = await client.channels.fetch(panel.channelId);
    if (!channel?.messages) return null;
    const message = await channel.messages.fetch(panel.messageId);
    return message || null;
  } catch {
    deletePanel(guildId);
    return null;
  }
}

async function refreshStoredPanel(guildId) {
  const panelMessage = await fetchStoredPanel(guildId);
  if (!panelMessage) return null;
  const player = playerFor(guildId);
  await panelMessage.edit(buildPanel(player));
  return panelMessage;
}

async function publishPanel(channel, guildId, player) {
  const existing = await fetchStoredPanel(guildId);
  if (existing) {
    await existing.edit(buildPanel(player));
    return existing;
  }

  const message = await channel.send(buildPanel(player));
  setPanel(guildId, { channelId: channel.id, messageId: message.id });
  return message;
}

function rememberPanelFromInteraction(interaction) {
  if (!interaction.message?.id || !interaction.channelId) return;
  setPanel(interaction.guildId, {
    channelId: interaction.channelId,
    messageId: interaction.message.id,
  });
}

async function queueTrack(message, query) {
  const voiceChannel = message.member?.voice?.channel;
  const player = playerFor(message.guildId);
  const loading = await message.reply('Ищу трек...');
  const result = await player.enqueue(query, message.author, voiceChannel);
  await refreshStoredPanel(message.guildId);
  if (!result.ok) return loading.edit(`Не получилось: ${result.error}`);
  return loading.edit(`Добавлено: **${result.track.title}**`);
}

client.once(Events.ClientReady, c => {
  console.log(`BDODJ Node ready as ${c.user.tag}, prefix '${config.prefix}'`);
  if (config.activity) c.user.setActivity(config.activity);
});

client.on(Events.MessageCreate, async message => {
  if (!message.guild || message.author.bot) return;
  if (!message.content.startsWith(config.prefix)) return;

  const body = message.content.slice(config.prefix.length).trim();
  const [commandRaw, ...rest] = body.split(/\s+/);
  const command = String(commandRaw || '').toLowerCase();
  const args = rest.join(' ').trim();
  const player = playerFor(message.guildId);

  if (command === 'play' || command === 'p') {
    if (!args) return message.reply(`Используй \`${config.prefix}play <трек или ссылка>\`.`);
    return queueTrack(message, args);
  }
  if (command === 'join') {
    const result = await player.connectOnly(message.member?.voice?.channel);
    await refreshStoredPanel(message.guildId);
    return message.reply(result.ok ? 'Голосовое подключение готово.' : `Не удалось подключиться: ${result.error}`);
  }
  if (command === 'panel' || command === 'music') {
    if (args === 'reset') deletePanel(message.guildId);
    const panelMessage = await publishPanel(message.channel, message.guildId, player);
    return message.reply(`Панель готова: ${panelMessage.url}`);
  }
  if (command === 'pause' || command === 'resume') {
    const ok = player.pause();
    await refreshStoredPanel(message.guildId);
    return message.reply(ok ? 'Пауза переключена.' : 'Сейчас ничего не играет.');
  }
  if (command === 'skip') {
    const ok = player.skip();
    await refreshStoredPanel(message.guildId);
    return message.reply(ok ? 'Пропускаю.' : 'Сейчас нечего пропускать.');
  }
  if (command === 'stop') {
    player.stop();
    await refreshStoredPanel(message.guildId);
    return message.reply('Остановлено.');
  }
  if (command === 'leave' || command === 'disconnect') {
    player.leave();
    await refreshStoredPanel(message.guildId);
    return message.reply('Вышел из голосового канала.');
  }
  if (command === 'queue' || command === 'q') return message.reply(buildQueue(player));
  if (command === 'now' || command === 'np') return message.reply(player.currentTrack ? `Сейчас: **${player.currentTrack.title}**` : 'Сейчас ничего не играет.');
  if (command === 'help') {
    return message.reply([
      `\`${config.prefix}play <трек или ссылка>\``,
      `\`${config.prefix}join\``,
      `\`${config.prefix}panel\`, \`${config.prefix}panel reset\``,
      `\`${config.prefix}pause\`, \`${config.prefix}skip\`, \`${config.prefix}stop\`, \`${config.prefix}leave\``,
      `\`${config.prefix}queue\`, \`${config.prefix}now\``,
    ].join('\n'));
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.guild) return;
  const player = playerFor(interaction.guildId);

  if (interaction.isButton()) {
    rememberPanelFromInteraction(interaction);
    if (interaction.customId === 'bdodj_add') return interaction.showModal(musicModal());
    if (interaction.customId === 'bdodj_queue') return interaction.reply({ ...buildQueue(player), flags: MessageFlags.Ephemeral });
    if (interaction.customId === 'bdodj_pause') {
      player.pause();
      return interaction.update(buildPanel(player));
    }
    if (interaction.customId === 'bdodj_skip') {
      player.skip();
      return interaction.update(buildPanel(player));
    }
    if (interaction.customId === 'bdodj_stop') {
      player.stop();
      return interaction.update(buildPanel(player));
    }
    if (interaction.customId === 'bdodj_shuffle') {
      player.shuffleQueue();
      return interaction.update(buildPanel(player));
    }
    if (interaction.customId === 'bdodj_refresh') return interaction.update(buildPanel(player));
    if (interaction.customId === 'bdodj_leave') {
      player.leave();
      return interaction.update(buildPanel(player));
    }
  }

  if (interaction.isModalSubmit() && interaction.customId === 'bdodj_modal_add') {
    const query = interaction.fields.getTextInputValue('query');
    const voiceChannel = interaction.member?.voice?.channel;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await player.enqueue(query, interaction.user, voiceChannel);
    await refreshStoredPanel(interaction.guildId);
    if (!result.ok) return interaction.editReply(`Не получилось: ${result.error}`);
    return interaction.editReply(`Добавлено: **${result.track.title}**`);
  }
});

client.login(config.token);

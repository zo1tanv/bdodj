const {
  ActionRowBuilder,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
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

function slashCommands() {
  return [
    new SlashCommandBuilder()
      .setName('panel')
      .setDescription('Create or refresh the BDODJ music panel in this channel')
      .addBooleanOption(option =>
        option.setName('reset').setDescription('Create a new saved panel in this channel')
      ),
    new SlashCommandBuilder()
      .setName('play')
      .setDescription('Add a YouTube link or search text to the queue')
      .addStringOption(option =>
        option.setName('query').setDescription('YouTube link or search text').setRequired(true)
      ),
    new SlashCommandBuilder().setName('join').setDescription('Connect BDODJ to your voice channel'),
    new SlashCommandBuilder().setName('pause').setDescription('Pause or resume playback'),
    new SlashCommandBuilder().setName('skip').setDescription('Skip the current track'),
    new SlashCommandBuilder().setName('stop').setDescription('Stop playback and clear the queue'),
    new SlashCommandBuilder().setName('leave').setDescription('Disconnect BDODJ from voice'),
    new SlashCommandBuilder().setName('queue').setDescription('Show the queue privately'),
    new SlashCommandBuilder().setName('now').setDescription('Show the current track'),
  ].map(command => command.toJSON());
}

async function registerSlashCommandsForGuild(guild) {
  await guild.commands.set(slashCommands());
}

async function registerSlashCommands() {
  const guilds = [...client.guilds.cache.values()];
  await Promise.all(guilds.map(registerSlashCommandsForGuild));
  console.log(`Registered BDODJ slash commands in ${guilds.length} guild(s).`);

  if (!guilds.length) {
    await client.application.commands.set(slashCommands());
    console.log('Registered BDODJ global slash commands.');
  }
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

async function handleSlashCommand(interaction, player) {
  if (interaction.commandName === 'panel') {
    if (interaction.options.getBoolean('reset')) deletePanel(interaction.guildId);
    const panelMessage = await publishPanel(interaction.channel, interaction.guildId, player);
    return interaction.reply({ content: `Панель готова: ${panelMessage.url}`, flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'play') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await player.enqueue(
      interaction.options.getString('query', true),
      interaction.user,
      interaction.member?.voice?.channel
    );
    await refreshStoredPanel(interaction.guildId);
    if (!result.ok) return interaction.editReply(`Не получилось: ${result.error}`);
    return interaction.editReply(`Добавлено: **${result.track.title}**`);
  }

  if (interaction.commandName === 'join') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await player.connectOnly(interaction.member?.voice?.channel);
    await refreshStoredPanel(interaction.guildId);
    return interaction.editReply(result.ok ? 'Голосовое подключение готово.' : `Не удалось подключиться: ${result.error}`);
  }

  if (interaction.commandName === 'pause') {
    const ok = player.pause();
    await refreshStoredPanel(interaction.guildId);
    return interaction.reply({ content: ok ? 'Пауза переключена.' : 'Сейчас ничего не играет.', flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'skip') {
    const ok = player.skip();
    await refreshStoredPanel(interaction.guildId);
    return interaction.reply({ content: ok ? 'Пропускаю.' : 'Сейчас нечего пропускать.', flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'stop') {
    player.stop();
    await refreshStoredPanel(interaction.guildId);
    return interaction.reply({ content: 'Остановлено.', flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'leave') {
    player.leave();
    await refreshStoredPanel(interaction.guildId);
    return interaction.reply({ content: 'Вышел из голосового канала.', flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'queue') {
    return interaction.reply({ ...buildQueue(player), flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'now') {
    return interaction.reply({
      content: player.currentTrack ? `Сейчас: **${player.currentTrack.title}**` : 'Сейчас ничего не играет.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function reportInteractionError(interaction, error) {
  console.error('Interaction failed:', error.stack || error.message);
  const payload = { content: 'Что-то пошло не так. Посмотри логи BDODJ.', flags: MessageFlags.Ephemeral };
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply(payload.content);
    else await interaction.reply(payload);
  } catch {}
}

client.once(Events.ClientReady, async c => {
  console.log(`BDODJ Node ready as ${c.user.tag}`);
  if (config.activity) c.user.setActivity(config.activity);
  try {
    await registerSlashCommands();
  } catch (error) {
    console.error('Failed to register slash commands:', error.stack || error.message);
  }
});

client.on(Events.GuildCreate, async guild => {
  try {
    await registerSlashCommandsForGuild(guild);
  } catch (error) {
    console.error(`Failed to register slash commands for ${guild.id}:`, error.message);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.guild) return;
  const player = playerFor(interaction.guildId);

  try {
    if (interaction.isChatInputCommand()) return await handleSlashCommand(interaction, player);

    if (interaction.isButton()) {
      rememberPanelFromInteraction(interaction);
      if (interaction.customId === 'bdodj_add') return await interaction.showModal(musicModal());
      if (interaction.customId === 'bdodj_queue') return await interaction.reply({ ...buildQueue(player), flags: MessageFlags.Ephemeral });
      if (interaction.customId === 'bdodj_pause') {
        player.pause();
        return await interaction.update(buildPanel(player));
      }
      if (interaction.customId === 'bdodj_skip') {
        player.skip();
        return await interaction.update(buildPanel(player));
      }
      if (interaction.customId === 'bdodj_stop') {
        player.stop();
        return await interaction.update(buildPanel(player));
      }
      if (interaction.customId === 'bdodj_shuffle') {
        player.shuffleQueue();
        return await interaction.update(buildPanel(player));
      }
      if (interaction.customId === 'bdodj_refresh') return await interaction.update(buildPanel(player));
      if (interaction.customId === 'bdodj_leave') {
        player.leave();
        return await interaction.update(buildPanel(player));
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'bdodj_modal_add') {
      const query = interaction.fields.getTextInputValue('query');
      const voiceChannel = interaction.member?.voice?.channel;
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await player.enqueue(query, interaction.user, voiceChannel);
      await refreshStoredPanel(interaction.guildId);
      if (!result.ok) return await interaction.editReply(`Не получилось: ${result.error}`);
      return await interaction.editReply(`Добавлено: **${result.track.title}**`);
    }
  } catch (error) {
    await reportInteractionError(interaction, error);
  }
});

client.login(config.token);

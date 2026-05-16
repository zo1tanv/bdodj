const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const config = require('./config');
const MusicPlayer = require('./musicPlayer');
const { buildPanel, buildQueue } = require('./musicPanel');
const { deletePanel, getPanel, setPanel } = require('./panelStore');
const recommendations = require('./recommendations');
const playlists = require('./playlistStore');
const { guildSettings, setGuildVolume } = require('./settingsStore');

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
    const settings = guildSettings(guildId);
    if (settings.volumeLevel) player.setVolumeLevel(settings.volumeLevel);
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
    new SlashCommandBuilder()
      .setName('playlist')
      .setDescription('Manage BDODJ playlists')
      .addSubcommand(command =>
        command.setName('list')
          .setDescription('Show playlists')
          .addStringOption(option => option.setName('scope').setDescription('Playlist scope').setRequired(true).addChoices(
            { name: 'Server', value: 'server' },
            { name: 'Personal', value: 'personal' },
          ))
      )
      .addSubcommand(command =>
        command.setName('create')
          .setDescription('Create a playlist')
          .addStringOption(option => option.setName('scope').setDescription('Playlist scope').setRequired(true).addChoices(
            { name: 'Server', value: 'server' },
            { name: 'Personal', value: 'personal' },
          ))
          .addStringOption(option => option.setName('name').setDescription('Playlist name').setRequired(true))
      )
      .addSubcommand(command =>
        command.setName('add-current')
          .setDescription('Save the current track to a playlist')
          .addStringOption(option => option.setName('scope').setDescription('Playlist scope').setRequired(true).addChoices(
            { name: 'Server', value: 'server' },
            { name: 'Personal', value: 'personal' },
          ))
          .addStringOption(option => option.setName('name').setDescription('Playlist name').setRequired(true))
      )
      .addSubcommand(command =>
        command.setName('add-query')
          .setDescription('Save a YouTube link or search text to a playlist')
          .addStringOption(option => option.setName('scope').setDescription('Playlist scope').setRequired(true).addChoices(
            { name: 'Server', value: 'server' },
            { name: 'Personal', value: 'personal' },
          ))
          .addStringOption(option => option.setName('name').setDescription('Playlist name').setRequired(true))
          .addStringOption(option => option.setName('query').setDescription('YouTube link or search text').setRequired(true))
      )
      .addSubcommand(command =>
        command.setName('play')
          .setDescription('Add a playlist to the queue')
          .addStringOption(option => option.setName('scope').setDescription('Playlist scope').setRequired(true).addChoices(
            { name: 'Server', value: 'server' },
            { name: 'Personal', value: 'personal' },
          ))
          .addStringOption(option => option.setName('name').setDescription('Playlist name').setRequired(true))
      )
      .addSubcommand(command =>
        command.setName('delete')
          .setDescription('Delete a playlist')
          .addStringOption(option => option.setName('scope').setDescription('Playlist scope').setRequired(true).addChoices(
            { name: 'Server', value: 'server' },
            { name: 'Personal', value: 'personal' },
          ))
          .addStringOption(option => option.setName('name').setDescription('Playlist name').setRequired(true))
      ),
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

function isUnknownMessage(error) {
  return error?.code === 10008 || /Unknown Message/i.test(String(error?.message || ''));
}

async function refreshStoredPanel(guildId) {
  const panelMessage = await fetchStoredPanel(guildId);
  if (!panelMessage) return null;
  const player = playerFor(guildId);
  try {
    await panelMessage.edit(buildPanel(player));
    return panelMessage;
  } catch (error) {
    if (isUnknownMessage(error)) {
      deletePanel(guildId);
      return null;
    }
    throw error;
  }
}

async function publishPanel(channel, guildId, player) {
  const existing = await fetchStoredPanel(guildId);
  if (existing) {
    try {
      await existing.edit(buildPanel(player));
      return existing;
    } catch (error) {
      if (!isUnknownMessage(error)) throw error;
      deletePanel(guildId);
    }
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

function playlistScopeLabel(scope) {
  return scope === 'personal' ? 'личный' : 'серверный';
}

function buildRecommendationCategoryMenu() {
  const categories = recommendations.categories().slice(0, 25);
  if (!categories.length) {
    return { content: 'Рекомендации пока не настроены.', components: [] };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('bdodj_rec_category')
    .setPlaceholder('Выбери категорию')
    .addOptions(categories.map(category => ({
      label: category.label,
      description: category.description || undefined,
      value: category.id,
    })));

  return {
    content: 'Выбери настроение, а потом трек.',
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

function buildRecommendationTrackMenu(categoryId) {
  const category = recommendations.categoryById(categoryId);
  if (!category) return { content: 'Категория не найдена.', components: [] };

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`bdodj_rec_track:${category.id}`)
    .setPlaceholder('Выбери трек')
    .addOptions(category.tracks.slice(0, 25).map((track, index) => ({
      label: String(track.title || track.query).slice(0, 100),
      description: String(track.query || '').slice(0, 100),
      value: String(index),
    })));

  return {
    content: `Категория: **${category.label}**`,
    components: [new ActionRowBuilder().addComponents(menu)],
  };
}

function buildPlaylistHome() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bdodj_playlist_server').setLabel('Серверные').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bdodj_playlist_personal').setLabel('Мои').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bdodj_playlist_save:server').setLabel('Сохранить текущий').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('bdodj_playlist_create:server').setLabel('Создать').setStyle(ButtonStyle.Primary),
  );
  return {
    content: 'Плейлисты: выбери список или сохрани текущий трек.',
    components: [row],
  };
}

function buildPlaylistSelect(guildId, userId, scope) {
  const items = playlists.listPlaylists(guildId, scope, userId).slice(0, 25);
  if (!items.length) {
    return {
      content: `${playlistScopeLabel(scope)} плейлистов пока нет. Создай первый через кнопку или /playlist create.`,
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bdodj_playlist_create:${scope}`).setLabel('Создать').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`bdodj_playlist_save:${scope}`).setLabel('Сохранить текущий').setStyle(ButtonStyle.Success),
      )],
    };
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`bdodj_playlist_play:${scope}`)
    .setPlaceholder('Выбери плейлист для добавления в очередь')
    .addOptions(items.map(playlist => ({
      label: playlist.name.slice(0, 100),
      description: `${playlist.tracks.length} трек(ов)`.slice(0, 100),
      value: playlist.id,
    })));

  return {
    content: `Выбери ${playlistScopeLabel(scope)} плейлист.`,
    components: [
      new ActionRowBuilder().addComponents(menu),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`bdodj_playlist_create:${scope}`).setLabel('Создать').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`bdodj_playlist_save:${scope}`).setLabel('Сохранить текущий').setStyle(ButtonStyle.Success),
      ),
    ],
  };
}

function playlistNameModal(customId, title) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel('Название плейлиста')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(80)
      )
    );
}

async function enqueueQuery(interaction, player, query) {
  const result = await player.enqueue(query, interaction.user, interaction.member?.voice?.channel);
  await refreshStoredPanel(interaction.guildId);
  return result;
}

async function enqueuePlaylist(interaction, player, playlist) {
  if (!playlist?.tracks?.length) return { ok: false, error: 'Плейлист пуст.' };
  let added = 0;
  let lastError = null;
  for (const track of playlist.tracks.slice(0, 25)) {
    const result = await enqueueQuery(interaction, player, track.query);
    if (result.ok) added += 1;
    else lastError = result.error;
  }
  if (!added) return { ok: false, error: lastError || 'Не удалось добавить треки.' };
  return { ok: true, added };
}

async function handleSlashCommand(interaction, player) {
  if (interaction.commandName === 'panel') {
    if (interaction.options.getBoolean('reset')) deletePanel(interaction.guildId);
    const panelMessage = await publishPanel(interaction.channel, interaction.guildId, player);
    return interaction.reply({ content: `Панель готова: ${panelMessage.url}`, flags: MessageFlags.Ephemeral });
  }

  if (interaction.commandName === 'play') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await enqueueQuery(interaction, player, interaction.options.getString('query', true));
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

  if (interaction.commandName === 'playlist') {
    const subcommand = interaction.options.getSubcommand();
    const scope = interaction.options.getString('scope');
    const name = interaction.options.getString('name');

    if (subcommand === 'list') {
      const items = playlists.listPlaylists(interaction.guildId, scope, interaction.user.id);
      const lines = items.length
        ? items.slice(0, 20).map(item => `- **${item.name}** (${item.tracks.length})`)
        : [`${playlistScopeLabel(scope)} плейлистов пока нет.`];
      return interaction.reply({ content: lines.join('\n'), flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'create') {
      const result = playlists.createPlaylist(interaction.guildId, scope, interaction.user.id, name);
      return interaction.reply({
        content: result.ok ? `Создан ${playlistScopeLabel(scope)} плейлист **${result.playlist.name}**.` : `Не получилось: ${result.error}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'add-current') {
      if (!player.currentTrack) {
        return interaction.reply({ content: 'Сейчас ничего не играет.', flags: MessageFlags.Ephemeral });
      }
      const result = playlists.addTrack(interaction.guildId, scope, interaction.user.id, name, {
        title: player.currentTrack.title,
        query: player.currentTrack.webpageUrl,
      });
      return interaction.reply({
        content: result.ok ? `Сохранено в **${result.playlist.name}**.` : `Не получилось: ${result.error}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'add-query') {
      const query = interaction.options.getString('query', true);
      const result = playlists.addTrack(interaction.guildId, scope, interaction.user.id, name, { title: query, query });
      return interaction.reply({
        content: result.ok ? `Добавлено в **${result.playlist.name}**.` : `Не получилось: ${result.error}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (subcommand === 'play') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const playlist = playlists.getPlaylist(interaction.guildId, scope, interaction.user.id, name);
      const result = await enqueuePlaylist(interaction, player, playlist);
      if (!result.ok) return interaction.editReply(`Не получилось: ${result.error}`);
      return interaction.editReply(`Добавлено из плейлиста **${playlist.name}**: ${result.added} трек(ов).`);
    }

    if (subcommand === 'delete') {
      const ok = playlists.deletePlaylist(interaction.guildId, scope, interaction.user.id, name);
      return interaction.reply({
        content: ok ? `Плейлист **${name}** удалён.` : `Плейлист **${name}** не найден.`,
        flags: MessageFlags.Ephemeral,
      });
    }
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
      if (interaction.customId === 'bdodj_recommend') return await interaction.reply({ ...buildRecommendationCategoryMenu(), flags: MessageFlags.Ephemeral });
      if (interaction.customId === 'bdodj_playlists') return await interaction.reply({ ...buildPlaylistHome(), flags: MessageFlags.Ephemeral });
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
      if (interaction.customId.startsWith('bdodj_playlist_create:')) {
        const scope = interaction.customId.split(':')[1] || 'server';
        return await interaction.showModal(playlistNameModal(`bdodj_modal_playlist_create:${scope}`, 'Создать плейлист'));
      }
      if (interaction.customId.startsWith('bdodj_playlist_save:')) {
        const scope = interaction.customId.split(':')[1] || 'server';
        return await interaction.showModal(playlistNameModal(`bdodj_modal_playlist_save:${scope}`, 'Сохранить текущий трек'));
      }
      if (interaction.customId === 'bdodj_playlist_server') {
        return await interaction.update(buildPlaylistSelect(interaction.guildId, interaction.user.id, 'server'));
      }
      if (interaction.customId === 'bdodj_playlist_personal') {
        return await interaction.update(buildPlaylistSelect(interaction.guildId, interaction.user.id, 'personal'));
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'bdodj_volume') {
        const ok = player.setVolumeLevel(Number(interaction.values[0]));
        if (ok) setGuildVolume(interaction.guildId, player.getVolumeLevel());
        const suffix = player.currentTrack ? ' Применится со следующего трека.' : '';
        await interaction.update(buildPanel(player));
        return await interaction.followUp({
          content: ok ? `Громкость: **${player.getVolumeLevel()}/10**.${suffix}` : 'Не удалось изменить громкость.',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (interaction.customId === 'bdodj_rec_category') {
        return await interaction.update(buildRecommendationTrackMenu(interaction.values[0]));
      }

      if (interaction.customId.startsWith('bdodj_rec_track:')) {
        const categoryId = interaction.customId.split(':')[1];
        const track = recommendations.trackByValue(categoryId, interaction.values[0]);
        await interaction.deferUpdate();
        if (!track) return await interaction.editReply({ content: 'Трек не найден.', components: [] });
        const result = await enqueueQuery(interaction, player, track.query);
        if (!result.ok) return await interaction.editReply({ content: `Не получилось: ${result.error}`, components: [] });
        return await interaction.editReply({ content: `Добавлено: **${result.track.title}**`, components: [] });
      }

      if (interaction.customId.startsWith('bdodj_playlist_play:')) {
        const scope = interaction.customId.split(':')[1] || 'server';
        await interaction.deferUpdate();
        const playlist = playlists.getPlaylist(interaction.guildId, scope, interaction.user.id, interaction.values[0]);
        const result = await enqueuePlaylist(interaction, player, playlist);
        if (!result.ok) return await interaction.editReply({ content: `Не получилось: ${result.error}`, components: [] });
        return await interaction.editReply({ content: `Добавлено из плейлиста **${playlist.name}**: ${result.added} трек(ов).`, components: [] });
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'bdodj_modal_add') {
      const query = interaction.fields.getTextInputValue('query');
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await enqueueQuery(interaction, player, query);
      if (!result.ok) return await interaction.editReply(`Не получилось: ${result.error}`);
      return await interaction.editReply(`Добавлено: **${result.track.title}**`);
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('bdodj_modal_playlist_create:')) {
      const scope = interaction.customId.split(':')[1] || 'server';
      const name = interaction.fields.getTextInputValue('name');
      const result = playlists.createPlaylist(interaction.guildId, scope, interaction.user.id, name);
      return await interaction.reply({
        content: result.ok ? `Создан ${playlistScopeLabel(scope)} плейлист **${result.playlist.name}**.` : `Не получилось: ${result.error}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('bdodj_modal_playlist_save:')) {
      const scope = interaction.customId.split(':')[1] || 'server';
      const name = interaction.fields.getTextInputValue('name');
      if (!player.currentTrack) {
        return await interaction.reply({ content: 'Сейчас ничего не играет.', flags: MessageFlags.Ephemeral });
      }
      const result = playlists.addTrack(interaction.guildId, scope, interaction.user.id, name, {
        title: player.currentTrack.title,
        query: player.currentTrack.webpageUrl,
      });
      return await interaction.reply({
        content: result.ok ? `Сохранено в **${result.playlist.name}**.` : `Не получилось: ${result.error}`,
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    await reportInteractionError(interaction, error);
  }
});

client.login(config.token);

const { ActionRowBuilder, Client, Events, GatewayIntentBits, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const config = require('./config');
const MusicPlayer = require('./musicPlayer');
const { buildPanel, buildQueue } = require('./musicPanel');

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
    players.set(guildId, player);
  }
  return player;
}

function musicModal() {
  return new ModalBuilder()
    .setCustomId('bdodj_modal_add')
    .setTitle('Add track')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('query')
          .setLabel('YouTube link or search text')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

async function queueTrack(message, query) {
  const voiceChannel = message.member?.voice?.channel;
  const player = playerFor(message.guildId);
  const loading = await message.reply('Searching...');
  const result = await player.enqueue(query, message.author, voiceChannel);
  if (!result.ok) return loading.edit(`Error: ${result.error}`);
  return loading.edit(`Added: **${result.track.title}**`);
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
    if (!args) return message.reply(`Use \`${config.prefix}play <song or url>\`.`);
    return queueTrack(message, args);
  }
  if (command === 'panel' || command === 'music') return message.channel.send(buildPanel(player));
  if (command === 'pause' || command === 'resume') return message.reply(player.pause() ? 'Toggled pause.' : 'Nothing is playing.');
  if (command === 'skip') return message.reply(player.skip() ? 'Skipped.' : 'Nothing to skip.');
  if (command === 'stop') {
    player.stop();
    return message.reply('Stopped.');
  }
  if (command === 'leave' || command === 'disconnect') {
    player.leave();
    return message.reply('Disconnected.');
  }
  if (command === 'queue' || command === 'q') return message.reply(buildQueue(player));
  if (command === 'now' || command === 'np') return message.reply(player.currentTrack ? `Now: **${player.currentTrack.title}**` : 'Nothing is playing.');
  if (command === 'help') {
    return message.reply([
      `\`${config.prefix}play <song or url>\``,
      `\`${config.prefix}panel\``,
      `\`${config.prefix}pause\`, \`${config.prefix}skip\`, \`${config.prefix}stop\`, \`${config.prefix}leave\``,
      `\`${config.prefix}queue\`, \`${config.prefix}now\``,
    ].join('\n'));
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.guild) return;
  const player = playerFor(interaction.guildId);

  if (interaction.isButton()) {
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
  }

  if (interaction.isModalSubmit() && interaction.customId === 'bdodj_modal_add') {
    const query = interaction.fields.getTextInputValue('query');
    const voiceChannel = interaction.member?.voice?.channel;
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await player.enqueue(query, interaction.user, voiceChannel);
    if (!result.ok) return interaction.editReply(`Error: ${result.error}`);
    return interaction.editReply(`Added: **${result.track.title}**`);
  }
});

client.login(config.token);

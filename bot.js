const { Client, GatewayIntentBits, REST, Routes, PermissionsBitField } = require('discord.js');
require('dotenv').config();

// Create a new Discord client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

const commands = [
    {
        name: 'setnumberchannel',
        description: 'Sets this channel as the number sequence game channel.',
    },
    {
        name: 'resetsequence',
        description: 'Resets the number sequence to a custom start limit.',
        options: [
            {
                name: 'start',
                description: 'The custom starting number for the sequence',
                type: 4, // Integer type for slash command options
                required: false
            }
        ]
    },
    {
        name: 'unbanall',
        description: 'Unbans all users from the server.',
    },
    {
        name: 'resetwarn',
        description: 'Resets warnings for a specific user.',
        options: [
            {
                name: 'user',
                description: 'The user whose warnings should be reset',
                type: 6, // USER type for slash command options
                required: true
            }
        ]
    }
];

// Register the slash commands when the bot is ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
});

const warnings = {}; // Object to store warnings { userId: warningCount }
const maxWarnings = 3; // Max warnings before stopping
let expectedNumber = 1; // Default starting point for the sequence
let allowedChannelId = null; // Initially no channel is set for the number sequence game

// Helper function to check for Manage Server permission
function hasManageServerPermission(member) {
    return member.permissions.has(PermissionsBitField.Flags.ManageGuild);
}

// Listen for interaction events (slash commands)
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, member, options } = interaction;

    // Defer response to prevent timeout (slash command timeout prevention)
    await interaction.deferReply({ ephemeral: true });

    // Command to set the number sequence game channel (Admins only)
    if (commandName === 'setnumberchannel') {
        if (hasManageServerPermission(member)) {
            allowedChannelId = interaction.channel.id;
            expectedNumber = 1; // Reset the game when channel is set
            await interaction.editReply('This channel is now set for the number sequence game.');
        } else {
            await interaction.editReply('You do not have permission to set the channel.');
        }
    }

    // Command to reset the number sequence manually (Admins only)
    if (commandName === 'resetsequence') {
        if (hasManageServerPermission(member)) {
            const startLimit = options.getInteger('start') || 1; // Custom start or default to 1
            expectedNumber = startLimit;
            await interaction.editReply(`The number sequence has been reset to ${startLimit}.`);
        } else {
            await interaction.editReply('You do not have permission to reset the sequence.');
        }
    }

    // Command to unban all users (Admins only)
    if (commandName === 'unbanall') {
        if (hasManageServerPermission(member)) {
            interaction.guild.bans.fetch().then(bans => {
                if (bans.size === 0) {
                    return interaction.editReply('There are no banned users.');
                }
                bans.forEach(ban => {
                    interaction.guild.members.unban(ban.user.id);
                });
                interaction.editReply('All users have been unbanned.');
            }).catch(err => {
                interaction.editReply('An error occurred while fetching bans.');
                console.error(err);
            });
        } else {
            await interaction.editReply('You do not have permission to unban users.');
        }
    }

    // Command to reset warnings for a user
    if (commandName === 'resetwarn') {
        if (hasManageServerPermission(member)) {
            const user = options.getUser('user');
            if (warnings[user.id]) {
                delete warnings[user.id];
                await interaction.editReply(`Warnings for ${user.tag} have been reset.`);
            } else {
                await interaction.editReply(`${user.tag} has no warnings.`);
            }
        } else {
            await interaction.editReply('You do not have permission to reset warnings.');
        }
    }
});

// Number sequence game logic (allowing multi-digit numbers)
client.on('messageCreate', (message) => {
    // Ignore bot messages and ensure the allowed channel is set
    if (message.author.bot || !allowedChannelId || message.channel.id !== allowedChannelId) return;

    const userMessage = message.content.trim();

    // Split the message into valid numbers (handles multi-digit cases)
    const numbers = userMessage.split(/\s+/).map(num => parseInt(num)).filter(num => !isNaN(num));

    if (numbers.length === 0) {
        message.delete().catch(console.error); // Delete non-number messages
        return;
    }

    numbers.forEach(number => {
        if (number === expectedNumber) {
            message.channel.send(`Correct!`).then(msg => {
                setTimeout(() => msg.delete(), 5000); // Delete confirmation message after 5 seconds
            });
            expectedNumber++;
        } else {
            message.delete().catch(console.error); // Delete the message if the number is wrong
            if (!warnings[message.author.id]) {
                warnings[message.author.id] = 1;
            } else {
                warnings[message.author.id]++;
            }

            const remainingWarnings = maxWarnings - warnings[message.author.id];

            if (remainingWarnings > 0) {
                message.channel.send(`⚠️ Wrong number! The next number should be **${expectedNumber}**. You have ${remainingWarnings} warning(s) left.`).then(msg => {
                    setTimeout(() => msg.delete(), 5000); // Delete warning message after 5 seconds
                });
            } else {
                message.channel.send(`${message.author}, you have reached the maximum number of warnings.`).then(msg => {
                    setTimeout(() => msg.delete(), 5000); // Delete message after 5 seconds
                });
            }
        }
    });
});

// Log in to Discord with the bot token from .env file
client.login(process.env.BOT_TOKEN);

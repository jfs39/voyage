import { EnvironmentConfig } from '$/env.validation';
import { PrismaService } from '$/prisma/prisma.service';
import { parseTimeIntoSeconds } from '$/utils/funcs';
import { Injectable, Logger, Type } from '@nestjs/common';
import { Guild, Message, TextChannel } from 'discord.js';
import { LinkableSong } from '../interfaces/linkable-song.interface';
import { MusicBoard } from '../interfaces/music-board.interface';
import { MusicProvider } from '../interfaces/music-provider.interface';
import { YoutubeProvider } from '../providers/youtube.provider';

export const VOLUME_LOG = 15;

export type SearchOptions = {
	message: Message;
	forceProvider?: Type<MusicProvider>;
};

export type PlaySongOptions = {
	seek: number;
};

@Injectable()
export class MusicService {
	private readonly logger = new Logger(MusicService.name);

	private readonly guildBoards = new Map<string, MusicBoard>();

	/** Disconnect timeout, in seconds. */
	private readonly DISCONNECT_TIMEOUT: number;
	private readonly ALONE_DISCONNECT_TIMEOUT: number;

	static readonly seekBlacklist: Type<MusicProvider>[] = [YoutubeProvider];

	readonly providers: MusicProvider[];
	readonly fallbackProvider: MusicProvider;

	constructor(private readonly prisma: PrismaService, readonly env: EnvironmentConfig, readonly youtubeService: YoutubeProvider) {
		this.DISCONNECT_TIMEOUT = env.DISCORD_MUSIC_DISCONNECT_TIMEOUT * 1000;
		this.ALONE_DISCONNECT_TIMEOUT = env.DISCORD_MUSIC_ALONE_DISCONNECT_TIMEOUT * 1000;

		this.providers = [youtubeService];
		this.fallbackProvider = youtubeService;
	}

	protected getKeyFromGuild(guild: Guild) {
		return guild.id;
	}

	protected getMusicBoard(of: Message | MusicBoard | Guild) {
		if (of instanceof Message || of instanceof Guild) {
			if (of instanceof Message) {
				if (!of.guild) {
					return;
				}
				if (!of.member?.voice.channel) {
					return;
				}
			}

			const guild = of instanceof Message ? of.guild : of;

			if (!guild) {
				return;
			}

			const key = this.getKeyFromGuild(guild);

			return this.guildBoards.get(key);
		}

		return of;
	}

	protected cancelMusicBoardTimeout(musicBoard: MusicBoard) {
		if (musicBoard.disconnectTimeoutId) {
			clearTimeout(musicBoard.disconnectTimeoutId);
		}

		musicBoard.disconnectTimeoutId = undefined;
	}

	async play(query: string, message: Message) {
		if (!message.guild) {
			return;
		}
		if (!message.member?.voice.channel) {
			return;
		}

		const voiceChannel = message.member.voice.channel;

		const key = this.getKeyFromGuild(message.guild);

		const musicBoard = this.guildBoards.get(key);

		let song: LinkableSong | null;

		try {
			song = await this.getLinkableSong(query, { message });
		} catch (error) {
			await message.channel.send(`**_ERROR_** : ${error}`);
			return;
		}

		if (!song) {
			await message.channel.send(`Couldn't find a match for query \`${query}\`...`);
			return;
		}

		if (musicBoard) {
			musicBoard.songQueue.push(song);

			musicBoard.textChannel.send(`Added to queue: **${song.title}**`);
		} else {
			try {
				const connection = await voiceChannel.join();

				const newMusicBoard: MusicBoard = {
					id: key,
					textChannel: message.channel as TextChannel,
					voiceChannel: voiceChannel,
					songQueue: [],
					volume: 5,
					playing: false,
					doDisconnectImmediately: false,
					connection,
				};

				this.guildBoards.set(key, newMusicBoard);

				await this.playSong(song, newMusicBoard);

				newMusicBoard.textChannel.send(`Start playing: \`${song.title}\``);
			} catch (error) {
				await message.channel.send(`${error}`);
			}
		}
	}

	protected leaveAndClearMusicBoard(musicBoard: MusicBoard) {
		if (musicBoard.playing) {
			this.endCurrentSong(musicBoard, { disconnect: true });
		} else {
			musicBoard.voiceChannel.leave();

			this.guildBoards.delete(musicBoard.id);
		}
	}

	protected endCurrentSong(musicBoard: MusicBoard, options?: Partial<{ disconnect: boolean }>) {
		if (options?.disconnect) {
			musicBoard.songQueue = [];
			musicBoard.doDisconnectImmediately = true;
		}

		musicBoard.connection.dispatcher.end();
	}

	protected async playSong(song: LinkableSong, musicBoard: MusicBoard) {
		const playNextSong = async () => {
			musicBoard.playing = false;

			if (!musicBoard.doDisconnectImmediately) {
				const isProperLoopingCount = typeof musicBoard.looping == 'number' && musicBoard.looping > 0;

				if (musicBoard.looping == 'one' || isProperLoopingCount) {
					musicBoard.songQueue = [musicBoard.lastSongPlayed!, ...musicBoard.songQueue];

					if (typeof musicBoard.looping == 'number') {
						musicBoard.looping--;
					}
				}
			}

			const nextSong = musicBoard.songQueue.shift();

			if (!musicBoard.doDisconnectImmediately && musicBoard.looping == 'all') {
				musicBoard.songQueue = [...musicBoard.songQueue, musicBoard.lastSongPlayed!];
			}

			if (!nextSong) {
				if (musicBoard.doDisconnectImmediately) {
					this.leaveAndClearMusicBoard(musicBoard);
				} else {
					musicBoard.disconnectTimeoutId = setTimeout(() => this.leaveAndClearMusicBoard(musicBoard), this.DISCONNECT_TIMEOUT);
				}

				return;
			}

			this.setVolume(musicBoard, musicBoard.volume);

			await this.playSong(nextSong, musicBoard);
		};

		this.cancelMusicBoardTimeout(musicBoard);

		musicBoard.lastSongPlayed = song;

		try {
			await this.prisma.musicSetting.updateMany({
				data: {
					lastSongPlayed: song.query,
					nbOfSongsPlayed: {
						increment: 1,
					},
				},
				where: {
					channelId: musicBoard.textChannel.id,
					guild: {
						guildId: musicBoard.voiceChannel.guild.id,
					},
				},
			});
		} catch (error) {
			this.logger.error(error);
		}

		const stream = await song.getStream();

		musicBoard.playing = true;

		const dispatcher = musicBoard.connection
			.play(stream, {
				type: song.url.includes('youtube.com') ? 'opus' : 'ogg/opus',
				seek: song.options?.seek,
			})
			.on('finish', playNextSong)
			.on('error', (error) => {
				musicBoard.playing = false;

				console.error(error);
			});

		musicBoard.dispatcher = dispatcher;

		this.setVolume(musicBoard, musicBoard.volume);
	}

	protected async getLinkableSong(query: string, options: SearchOptions): Promise<LinkableSong | null> {
		if (options.forceProvider) {
			const forcedProvider = this.providers.find((provider) => provider instanceof options.forceProvider!);

			if (!forcedProvider) {
				return null;
			}

			const linkableSong = await forcedProvider.getLinkableSong(query, forcedProvider.isQueryProviderUrl(query), options.message);

			return linkableSong;
		}

		// No forced provider, find first that matches
		const provider = this.providers.find((provider) => provider.isQueryProviderUrl(query));

		const linkableSong = await (provider ?? this.fallbackProvider).getLinkableSong(query, !!provider, options.message);

		return linkableSong;
	}

	async setVolume(of: Message | MusicBoard, volume: number) {
		const musicBoard = this.getMusicBoard(of);

		if (musicBoard?.dispatcher) {
			musicBoard.dispatcher.setVolumeLogarithmic(volume / VOLUME_LOG);

			musicBoard.volume = volume;

			try {
				await this.prisma.musicSetting.updateMany({
					data: {
						volume,
					},
					where: {
						channelId: musicBoard.textChannel.id,
						guild: {
							guildId: musicBoard.voiceChannel.guild.id,
						},
						volume: {
							not: volume,
						},
					},
				});
			} catch (error) {
				this.logger.error(error);
			}
		}
	}

	async skip(message: Message) {
		const musicBoard = this.getMusicBoard(message);

		if (!musicBoard?.playing) {
			await message.channel.send(`Play a song first before trying to skip it!`);
			return;
		}

		const didSkipAll = !musicBoard.songQueue.length;

		if (didSkipAll) {
			musicBoard.doDisconnectImmediately = true;
		}

		this.endCurrentSong(musicBoard);

		if (!didSkipAll) {
			await message.channel.send(`Skipped!`);
		} else {
			await message.channel.send(`Skipped! No more songs are the the queue, goodbye!`);
		}
	}

	async disconnect(message: Message) {
		const musicBoard = this.getMusicBoard(message);

		if (!musicBoard) {
			await message.channel.send(`I'm not even playing a song :/`);
			return;
		}

		if (musicBoard.playing) {
			this.endCurrentSong(musicBoard, { disconnect: true });
		} else {
			this.leaveAndClearMusicBoard(musicBoard);
		}

		await message.channel.send(`Adios!`);
	}

	async seek(timestamp: string, message: Message) {
		const musicBoard = this.getMusicBoard(message);

		if (!musicBoard?.playing) {
			await message.channel.send(`I cannot seek through a song when nothing is playing!`);
			return;
		}

		const seekedSong = musicBoard.lastSongPlayed!;

		if (MusicService.seekBlacklist.includes(seekedSong.provider)) {
			await message.channel.send(`Unfortunately, seeking for \`${seekedSong.provider}\` is not available.`);
			return;
		}

		const seekTime = parseTimeIntoSeconds(timestamp);

		seekedSong.options = { ...seekedSong.options, seek: seekTime };

		musicBoard.songQueue = [seekedSong, ...musicBoard.songQueue];

		this.endCurrentSong(musicBoard);

		await message.channel.send(`Seeked current song to ${seekTime} seconds!`);
	}

	async startAloneTimeout(guild: Guild) {
		const musicBoard = this.getMusicBoard(guild);

		if (!musicBoard) {
			return;
		}

		musicBoard.disconnectTimeoutId = setTimeout(() => {
			musicBoard.textChannel.send(`Nobody's listening to me anymore, cya!`);

			this.leaveAndClearMusicBoard(musicBoard);
		}, this.ALONE_DISCONNECT_TIMEOUT);
	}

	async stopAloneTimeout(guild: Guild) {
		const musicBoard = this.getMusicBoard(guild);

		if (!musicBoard) {
			return;
		}

		this.cancelMusicBoardTimeout(musicBoard);
	}

	async loop(message: Message, count?: number) {
		const musicBoard = this.getMusicBoard(message);

		if (!musicBoard?.playing) {
			await message.channel.send(`I cannot set a looping song when nothing is playing!`);
			return;
		}

		musicBoard.looping = count ?? 'one';

		if (count) {
			await message.channel.send(`Looping current song (\`${musicBoard.lastSongPlayed!.title}\`) **${count}** times!`);
		} else {
			await message.channel.send(`Looping current song (\`${musicBoard.lastSongPlayed!.title}\`)!`);
		}
	}

	async loopAll(message: Message) {
		const musicBoard = this.getMusicBoard(message);

		if (!musicBoard?.playing) {
			await message.channel.send(`I cannot loop the player when nothing is playing!`);
			return;
		}

		musicBoard.looping = 'all';

		await message.channel.send(`Looping all song in the current playlist!`);
	}

	async unloop(message: Message) {
		const musicBoard = this.getMusicBoard(message);

		if (!musicBoard?.playing) {
			await message.channel.send(`I don't need to unloop anything : nothing is playing!`);
			return;
		}

		musicBoard.looping = undefined;

		await message.channel.send(`Unlooped the current music playlist!`);
	}
}
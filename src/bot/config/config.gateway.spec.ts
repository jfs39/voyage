import { PrismaService } from '$/prisma/prisma.service';
import { Test, TestingModule } from '@nestjs/testing';
import { discordModule } from '../bot.module';
import { DiscordConfigGateway } from './config.gateway';

describe('ConfigGateway', () => {
	let gateway: DiscordConfigGateway;
	let module: TestingModule;

	beforeEach(async () => {
		module = await Test.createTestingModule({
			imports: [discordModule],
			providers: [DiscordConfigGateway, PrismaService],
		}).compile();

		gateway = module.get<DiscordConfigGateway>(DiscordConfigGateway);
	});

	afterAll(async () => {
		await module.close();
	});

	it('should be defined', () => {
		expect(gateway).toBeDefined();
	});
});

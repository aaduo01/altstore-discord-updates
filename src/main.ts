import * as fs from 'fs';
import axios from 'axios';

import { UpdatedApp, UpdatedNews, Cache, Repo } from './utils/types';
import { appToEmbed, newsToEmbed } from './utils/utils';

const cfg = require('../config.json');

(async () => {
	const initialCache = { app: {}, news: {} } as const;

	const cacheFile = 'cache.json';

	if (!fs.existsSync(cacheFile)) {
		fs.writeFileSync(cacheFile, JSON.stringify(initialCache));
	}

	let cache: Cache;

	try {
		cache = JSON.parse(fs.readFileSync(cacheFile).toString());
	} catch (e) {
		cache = initialCache;
	}

	const updatedApps: UpdatedApp[] = [];
	const newNews: UpdatedNews[] = [];

	const repoData: Repo[] = await Promise.all(
		cfg.sources.map(async (sourceURL: string) => (await axios.get(sourceURL)).data),
	);

	const newCache: Cache = repoData.reduce(
		(result: Cache, source) => ({
			app: {
				...result.app,
				[source.identifier]: source.apps.reduce((previousApp: Cache['app'][string], app) => {
					if (cache.app[source.identifier]?.[app.bundleIdentifier] !== app.version) {
						updatedApps.push({ app, source: source.name });
					}
					return {
						...previousApp,
						[app.bundleIdentifier]: app.version,
					};
				}, {}),
			},
			news: {
				...result.news,
				[source.identifier]: source.news.map((news) => {
					if (!cache.news[source.identifier]?.includes(news.identifier)) {
						newNews.push({ news, source: source.name });
					}
					return news.identifier;
				}),
			},
		}),
		initialCache,
	);

	if (updatedApps.length !== 0)
		await axios.post(cfg.webhookUrl, {
			content: `<@&${cfg.roleID}>`,
			embeds: updatedApps.map(({ app, source }) => appToEmbed(app, source)),
		});

	if (newNews.length !== 0)
		await axios.post(cfg.webhookUrl, {
			content: `<@&${cfg.roleID}>`,
			embeds: newNews.map(({ news, source }) => newsToEmbed(news, source)),
		});

	fs.writeFileSync(cacheFile, JSON.stringify(newCache));
})();

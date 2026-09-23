import rss from '@astrojs/rss';
import { getPosts } from '../lib';
import { SITE_TITLE, SITE_DESCRIPTION } from '../consts';

export async function GET(context) {
  const posts = await getPosts();
  return rss({
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    site: context.site,
    items: posts.map((p) => ({
      title: p.data.title,
      description: p.data.description,
      pubDate: p.data.date,
      categories: [p.data.category, ...p.data.tags],
      link: `/posts/${p.id}/`,
    })),
    customData: '<language>ja</language>',
  });
}

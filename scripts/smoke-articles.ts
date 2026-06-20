import { app } from 'electron'
import * as articles from '../src/main/db/articles'
import type { ArticleBlock } from '../src/shared/types'

app
  .whenReady()
  .then(() => {
    const blocks: ArticleBlock[] = [
      { id: 'h2-1', kind: 'h2', text: '第一章', generation_id: null, image_url: null, situation_id: 1 },
      { id: 'dlg-1', kind: 'dialogue', text: 'こんにちは', generation_id: 999, image_url: null, situation_id: 1 },
      { id: 'img-1', kind: 'image', text: '', generation_id: 999, image_url: 'media://x', situation_id: 1 }
    ]
    const a = articles.saveArticle({ batch_id: null, title: 'テスト記事', intro: '導入', blocks })
    console.log('saved id:', a.id, '| title:', a.title, '| blocks:', a.blocks.length)

    const updated = articles.saveArticle({ id: a.id, batch_id: null, title: 'テスト記事(改)', intro: '導入2', blocks })
    if (updated.id !== a.id) throw new Error('update created a new row')
    console.log('updated title:', updated.title)

    const list = articles.listArticles()
    console.log('list contains:', list.some((x) => x.id === a.id), '| count:', list.length)

    const got = articles.getArticle(a.id)
    if (got?.title !== 'テスト記事(改)' || got.blocks.length !== 3) throw new Error('get mismatch')

    articles.deleteArticle(a.id)
    if (articles.getArticle(a.id)) throw new Error('delete failed')
    console.log('deleted OK')

    console.log('SMOKE_OK')
    app.quit()
  })
  .catch((e) => {
    console.error('SMOKE_FAIL', e)
    app.exit(1)
  })

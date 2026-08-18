import { GITHUB_URL, ZHIHU_URL, DOCS_URL } from '../constants'
import { useT } from '../i18n'

export default function Footer() {
  const t = useT()

  return (
    <footer className="border-t border-line bg-base">
      <div className="container-page py-16">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <img src="/logo.png" alt="MindForge" className="h-7 w-7 rounded-sm" />
              <span className="text-lg font-semibold tracking-tight">MindForge</span>
            </div>
            <p className="mt-4 text-lg leading-relaxed text-text-tertiary">
              {t('面向科研与技术团队的 AI 知识铸造平台。把散落的论文、报告与经验，铸造成会思考的知识网络。')}
            </p>
          </div>

          <div className="flex gap-12">
            <div>
              <h4 className="text-base font-medium uppercase tracking-wider text-text-muted">{t('社区')}</h4>
              <ul className="mt-4 space-y-3 text-lg">
                <li>
                  <a href={GITHUB_URL} className="text-text-secondary hover:text-accent">
                    GitHub
                  </a>
                </li>
                <li>
                  <a href={ZHIHU_URL} className="text-text-secondary hover:text-accent">
                    {t('知乎')}
                  </a>
                </li>
                <li>
                  <a href={DOCS_URL} className="text-text-secondary hover:text-accent">
                    {t('文档')}
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-base font-medium uppercase tracking-wider text-text-muted">{t('关注')}</h4>
              <ul className="mt-4 space-y-3 text-lg">
                <li>
                  <span className="text-text-secondary">{t('公众号：sudden的AI日常')}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-12 space-y-2 border-t border-line pt-6 text-base leading-relaxed text-text-muted">
          <p>
            {t('MindForge 以 BUSL-1.1 许可开源：个人、学习、研究、企业内部自部署免费；每个版本发布四年后转为 GPLv3。')}
          </p>
          <p>{t('这是我第一次独立开源一个完整系统，肯定还有很多不足，欢迎 Star、Issue 与 PR，一起把它变得更好。')}</p>
        </div>
      </div>
    </footer>
  )
}

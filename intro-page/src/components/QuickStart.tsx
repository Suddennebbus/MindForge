import { Reveal } from './Reveal'
import { useT } from '../i18n'

const dockerCmd = `docker build -t mindforge .
docker run -d --name mindforge -p 18333:80 -v mindforge-data:/data mindforge`

const steps = [
  { t: '登录并改密', d: '用 admin / admin 登录，首次登录强制修改密码。' },
  { t: '配置你的 LLM', d: '在设置页填自己的 API Key、Base URL、模型名，OpenAI 兼容即可。' },
  { t: '上传资料开始铸造', d: '上传论文或报告到待入库，审核后摄入，AI 自动生成结构化知识页。' },
]

export default function QuickStart() {
  const t = useT()

  return (
    <section id="quickstart" className="border-y border-line bg-surface">
      <div className="container-page py-20">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight">{t('一分钟跑起来')}</h2>
          <p className="mt-3 max-w-[60ch] text-lg text-text-secondary">
            {t('单 Docker 镜像，一条命令部署。全部数据（数据库、文件、密钥）都在一个 volume 里，备份即复制。')}
          </p>
        </Reveal>

        <div className="mt-12 space-y-10">
          <Reveal>
            <pre className="overflow-x-auto rounded-lg border border-line bg-base p-6">
              <code className="font-mono text-lg leading-relaxed text-text-primary">{dockerCmd}</code>
            </pre>
          </Reveal>

          <Reveal delay={100}>
            <h3 className="text-lg font-semibold text-text-primary">{t('首次使用')}</h3>
            <ol className="mt-4 space-y-6">
              {steps.map((s, i) => (
                <li key={s.t} className="flex gap-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/40 font-mono text-base text-accent">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-medium text-text-primary">{t(s.t)}</h3>
                    <p className="mt-1 text-lg text-text-tertiary">{t(s.d)}</p>
                  </div>
                </li>
              ))}
            </ol>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

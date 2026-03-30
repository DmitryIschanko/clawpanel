import { useState } from 'react'
import { 
  BookOpen, 
  ChevronDown, 
  ChevronUp, 
  Terminal, 
  Globe, 
  Package,
  Settings,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
} from 'lucide-react'

interface Step {
  title: string
  content: React.ReactNode
  icon: React.ReactNode
}

export function McpGuide() {
  const [isOpen, setIsOpen] = useState(false)
  const [expandedStep, setExpandedStep] = useState<number | null>(0)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCommand(id)
    setTimeout(() => setCopiedCommand(null), 2000)
  }

  const steps: Step[] = [
    {
      title: 'Что такое MCP?',
      icon: <BookOpen className="w-5 h-5" />,
      content: (
        <div className="space-y-3">
          <p>
            <strong>MCP (Model Context Protocol)</strong> — это протокол, который позволяет AI-агентам 
            OpenClaw взаимодействовать с внешними сервисами: базами данных, поисковыми системами, 
            файловыми системами и другими API.
          </p>
          <div className="bg-muted p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Примеры возможностей:</strong>
            </p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Поиск в интернете (Brave Search)</li>
              <li>Работа с файлами на сервере</li>
              <li>Доступ к базам данных PostgreSQL</li>
              <li>Автоматизация браузера (Puppeteer)</li>
              <li>Интеграция с GitHub</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      title: 'Типы подключения',
      icon: <Settings className="w-5 h-5" />,
      content: (
        <div className="space-y-4">
          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Terminal className="w-4 h-4 text-blue-500" />
              <h4 className="font-medium">stdio (локальные команды)</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Используется для MCP-серверов, которые запускаются как локальные программы 
              через командную строку (npx, python, node и т.д.)
            </p>
            <div className="mt-2 bg-secondary p-2 rounded text-sm font-mono">
              npx -y @modelcontextprotocol/server-filesystem ./data
            </div>
          </div>

          <div className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-green-500" />
              <h4 className="font-medium">http (удаленные серверы)</h4>
            </div>
            <p className="text-sm text-muted-foreground">
              Используется для подключения к удаленным MCP-серверам через HTTP. 
              Автоматически использует <code className="bg-secondary px-1 rounded">mcp-remote</code> bridge.
            </p>
            <div className="mt-2 bg-secondary p-2 rounded text-sm font-mono">
              https://api.example.com/mcp
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Способ 1: Установить готовый сервер',
      icon: <Package className="w-5 h-5" />,
      content: (
        <div className="space-y-3">
          <p className="text-sm">
            Самый простой способ — использовать один из предустановленных серверов:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Нажмите кнопку <strong>"Built-in"</strong> вверху страницы</li>
            <li>Выберите нужный сервер из списка (например, <strong>filesystem</strong> для работы с файлами)</li>
            <li>Нажмите <strong>"Install"</strong></li>
            <li>Сервер автоматически добавится и включится</li>
          </ol>
          <div className="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg">
            <p className="text-sm">
              <strong>Совет:</strong> Для начала рекомендуем установить <strong>filesystem</strong> — 
              он позволит агентам читать и записывать файлы в рабочую директорию.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Способ 2: Добавить вручную (stdio)',
      icon: <Terminal className="w-5 h-5" />,
      content: (
        <div className="space-y-3">
          <p className="text-sm">Для установки MCP-сервера из npm или другого источника:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Нажмите кнопку <strong>"Add Server"</strong></li>
            <li>Выберите <strong>Transport Type: stdio</strong></li>
            <li>Заполните поля:</li>
          </ol>
          <div className="space-y-2 mt-3">
            <div className="bg-secondary p-3 rounded-lg">
              <p className="text-sm font-medium">Пример: Filesystem Server</p>
              <div className="mt-2 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Name:</span>
                  <code className="bg-background px-2 py-0.5 rounded">my-files</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Command:</span>
                  <code className="bg-background px-2 py-0.5 rounded">npx</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Args:</span>
                  <code className="bg-background px-2 py-0.5 rounded">-y @modelcontextprotocol/server-filesystem /path/to/dir</code>
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              Аргументы разделяются пробелами. Если путь содержит пробелы, используйте кавычки: 
              <code className="bg-secondary px-1 rounded">"/path with spaces"</code>
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Способ 3: Импорт из JSON',
      icon: <ExternalLink className="w-5 h-5" />,
      content: (
        <div className="space-y-3">
          <p className="text-sm">
            Можно импортировать конфигурацию с сайтов вроде{' '}
            <a 
              href="https://www.pulsemcp.com/servers" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              pulsemcp.com
            </a>:
          </p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Найдите нужный MCP-сервер на pulsemcp.com</li>
            <li>Скопируйте JSON-конфигурацию</li>
            <li>В панели нажмите <strong>"Import JSON"</strong></li>
            <li>Вставьте JSON в текстовое поле</li>
            <li>Нажмите <strong>"Import"</strong></li>
          </ol>
          <div className="bg-muted p-3 rounded-lg mt-3">
            <p className="text-sm font-medium mb-2">Пример JSON:</p>
            <pre className="text-xs bg-secondary p-2 rounded overflow-x-auto">
{`{
  "name": "brave-search",
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-brave-search"],
  "env": {
    "BRAVE_API_KEY": "your-api-key-here"
  }
}`}
            </pre>
          </div>
        </div>
      ),
    },
    {
      title: 'Переменные окружения (API Keys)',
      icon: <Settings className="w-5 h-5" />,
      content: (
        <div className="space-y-3">
          <p className="text-sm">
            Многие MCP-серверы требуют API-ключи для доступа к сервисам. 
            Их нужно указать в поле <strong>Environment Variables</strong> в формате JSON:
          </p>
          <div className="relative">
            <pre className="text-sm bg-secondary p-3 rounded-lg">
{`{
  "BRAVE_API_KEY": "your-key-here",
  "GITHUB_TOKEN": "ghp_xxxxxxxx",
  "DATABASE_URL": "postgresql://user:pass@localhost/db"
}`}
            </pre>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/30 p-3 rounded-lg">
            <p className="text-sm">
              <strong>Важно:</strong> API-ключи хранятся в конфигурации OpenClaw на сервере. 
              Не передавайте их третьим лицам и регулярно обновляйте.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Как использовать в агентах',
      icon: <CheckCircle2 className="w-5 h-5" />,
      content: (
        <div className="space-y-3">
          <p className="text-sm">После добавления MCP-сервера:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Убедитесь, что статус сервера — <strong>"Enabled"</strong> (зеленый)</li>
            <li>Нажмите <strong>"Sync to OpenClaw"</strong> для применения изменений</li>
            <li>Перейдите в раздел <strong>Agents</strong> → выберите агента</li>
            <li>В разделе <strong>Tools</strong> появятся инструменты из MCP-сервера</li>
            <li>Активируйте нужные инструменты для агента</li>
          </ol>
          <div className="bg-green-500/10 border border-green-500/30 p-3 rounded-lg mt-3">
            <p className="text-sm">
              <strong>Готово!</strong> Теперь агент может использовать инструменты MCP-сервера 
              в своей работе. Например, искать в интернете или работать с файлами.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Проверка работы',
      icon: <Terminal className="w-5 h-5" />,
      content: (
        <div className="space-y-3">
          <p className="text-sm">Чтобы проверить, что MCP-сервер работает:</p>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Нажмите иконку <strong>🔄</strong> (Test connection) рядом с сервером</li>
            <li>Должна появиться галочка ✅ и надпись "Connected successfully"</li>
            <li>Если ошибка — проверьте настройки и API-ключи</li>
          </ol>
          <div className="bg-muted p-3 rounded-lg mt-3">
            <p className="text-sm font-medium">Для stdio-серверов:</p>
            <p className="text-sm text-muted-foreground mt-1">
              Проверка выполняет команду <code className="bg-secondary px-1 rounded">which [command]</code> — 
              она проверяет, что команда доступна в системе.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: 'Популярные MCP-серверы',
      icon: <Package className="w-5 h-5" />,
      content: (
        <div className="space-y-3">
          <div className="grid gap-2">
            {[
              { name: 'filesystem', desc: 'Работа с файлами и папками', cmd: 'npx -y @modelcontextprotocol/server-filesystem ./data' },
              { name: 'brave-search', desc: 'Поиск в интернете через Brave', cmd: 'npx -y @modelcontextprotocol/server-brave-search' },
              { name: 'puppeteer', desc: 'Автоматизация браузера', cmd: 'npx -y @modelcontextprotocol/server-puppeteer' },
              { name: 'github', desc: 'Доступ к репозиториям GitHub', cmd: 'npx -y @modelcontextprotocol/server-github' },
              { name: 'postgres', desc: 'Подключение к PostgreSQL', cmd: 'npx -y @modelcontextprotocol/server-postgres postgresql://...' },
            ].map((server) => (
              <div key={server.name} className="flex items-center justify-between p-2 bg-muted rounded-lg">
                <div>
                  <p className="font-medium text-sm">{server.name}</p>
                  <p className="text-xs text-muted-foreground">{server.desc}</p>
                </div>
                <button
                  onClick={() => copyToClipboard(server.cmd, server.name)}
                  className="p-2 hover:bg-secondary rounded-lg"
                  title="Копировать команду"
                >
                  {copiedCommand === server.name ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Больше серверов на{' '}
            <a 
              href="https://www.pulsemcp.com/servers" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              pulsemcp.com
            </a>
          </p>
        </div>
      ),
    },
  ]

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-primary" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold">Руководство по MCP</h3>
            <p className="text-sm text-muted-foreground">
              Пошаговая инструкция для не-разработчиков
            </p>
          </div>
        </div>
        {isOpen ? (
          <ChevronUp className="w-5 h-5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-5 h-5 text-muted-foreground" />
        )}
      </button>

      {isOpen && (
        <div className="border-t border-border">
          <div className="p-4 space-y-2">
            {steps.map((step, index) => (
              <div key={index} className="border rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedStep(expandedStep === index ? null : index)}
                  className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
                >
                  <div className="text-muted-foreground">
                    {step.icon}
                  </div>
                  <span className="font-medium flex-1">{step.title}</span>
                  {expandedStep === index ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>
                {expandedStep === index && (
                  <div className="px-3 pb-3">
                    <div className="pl-8 pt-2 border-t">
                      {step.content}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="px-4 pb-4">
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
              <h4 className="font-medium text-blue-500 mb-2">Быстрый старт</h4>
              <ol className="text-sm space-y-1 list-decimal list-inside">
                <li>Нажмите <strong>"Built-in"</strong></li>
                <li>Установите <strong>filesystem</strong></li>
                <li>Нажмите <strong>"Sync to OpenClaw"</strong></li>
                <li>Готово! Агенты могут работать с файлами.</li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

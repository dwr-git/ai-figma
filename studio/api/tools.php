<?php
// studio/api/tools.php — что помощник AI-Figma знает о себе и какие действия ему разрешены.
//
// Инструменты выполняет БРАУЗЕР (studio.js): только он видит запущенный
// редактор. Сервер лишь объявляет модели, какие инструменты есть, и решает,
// какие из них доступны в текущем режиме.

/** Инструменты, которые ничего не меняют в файле. Доступны в обоих режимах. */
function studio_read_tools(): array
{
    return [
        [
            'type' => 'function',
            'function' => [
                'name' => 'find_commands',
                'description' => 'Найти команды редактора по смыслу (по-русски или по-английски). '
                    . 'Возвращает id команды, русское название, путь в меню, горячую клавишу и описание параметров. '
                    . 'Вызывай перед run_command, если не знаешь точный id: id нельзя угадывать.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'query' => ['type' => 'string', 'description' => 'Что нужно сделать, 1–4 слова: «фрейм», «автолейаут», «компонент», «выровнять по центру», «тень», «text».'],
                    ],
                    'required' => ['query'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'get_state',
                'description' => 'Текущее состояние: открытый файл (сохранён ли), страницы, слои текущей страницы деревом '
                    . '(id, тип, имя, x, y, ширина, высота, текст, автолейаут), выделение (id), последние шаги, стили, выбранный инструмент.',
                'parameters' => ['type' => 'object', 'properties' => new stdClass()],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'inspect_layer',
                'description' => 'Все свойства одного слоя: заливки, обводки, эффекты, скругления, автолейаут, текст и шрифт, ограничения, дети.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'id' => ['type' => 'string', 'description' => 'id слоя из get_state'],
                        'depth' => ['type' => 'integer', 'description' => 'Сколько уровней детей показать (0–3), по умолчанию 1'],
                    ],
                    'required' => ['id'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'list_templates',
                'description' => 'Список готовых шаблонов (id, название, группа): кнопки, поля, карточки, шапки и подвалы, экраны телефона, блоки сайта, посты и слайды.',
                'parameters' => ['type' => 'object', 'properties' => new stdClass()],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'look_at_screen',
                'description' => 'Сделать снимок экрана редактора и посмотреть на него. Используй, чтобы проверить результат своих действий или увидеть макет.',
                'parameters' => ['type' => 'object', 'properties' => new stdClass()],
            ],
        ],
    ];
}

/** Инструменты, которые меняют файл или интерфейс. Только в режиме «Сделай». */
function studio_act_tools(): array
{
    return [
        [
            'type' => 'function',
            'function' => [
                'name' => 'insert_template',
                'description' => 'Вставить готовый шаблон одним шагом (отменяется одним Ctrl+Z). Встаёт справа от остального на странице '
                    . '(или внутрь фрейма into). Возвращает id корневого слоя.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'template' => ['type' => 'string', 'description' => 'id шаблона: m-login, m-signup, m-home, m-profile, m-list, m-product, m-cart, m-settings, m-chat, m-empty, m-onboarding, '
                            . 'w-hero, w-features, w-pricing, w-testimonials, w-cta, w-contact, w-dashboard, header, footer, sidebar, app-bar, tab-bar, '
                            . 'button, button-set, input, search, toggle, checkbox, tabs, badges, toast, progress, rating, pagination, '
                            . 'card-product, card-article, card-profile, card-price, card-stat, card-review, card-event, s-post, s-story, s-youtube, s-banner, p-card, slide-title, slide-content, p-certificate'],
                        'accent' => ['type' => 'string', 'description' => 'Основной цвет #RRGGBB (необязательно)'],
                        'dark' => ['type' => 'boolean', 'description' => 'Тёмный вариант'],
                        'into' => ['type' => 'string', 'description' => 'id фрейма, внутрь которого вставить (необязательно)'],
                    ],
                    'required' => ['template'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'build_design',
                'description' => 'Собрать новый макет целиком по описанию-дереву одним шагом (если что-то не так — не появится ничего). '
                    . 'Лучший способ создавать новые экраны, карточки, формы: не нужно склеивать слои по одному.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'spec' => ['type' => 'object', 'description' => 'Корневой узел: {type: "frame", name, w?, h?, layout: "vertical"|"horizontal", gap, padding, fill, cornerRadius, children: [...]}. '
                            . 'Узлы: frame (контейнер с автолейаутом), text {text, fontSize, fontStyle: "Regular"|"Medium"|"Semi Bold"|"Bold", fill}, rectangle, ellipse, '
                            . 'icon {icon: home|search|user|heart|bell|cart|menu|close|plus|check|arrow-left|arrow-right|chevron-right|settings|mail|lock|star|calendar|chat|image|phone|chart|grid|play|download|share|location|filter|trash|edit|globe|bolt|card|clock, size, color}. '
                            . 'Свойства: w, h, sizingH/sizingV ("fill" — растянуть, "hug" — по содержимому, "fixed"), mainAlign/crossAlign (min|center|max|spaceBetween), '
                            . 'stroke, strokeWeight, cornerRadius, opacity, shadow ("sm"|"md"|"lg"), textAlign. Цвета #RRGGBB или токены $accent $onAccent $bg $surface $text $muted $border $placeholder.'],
                        'accent' => ['type' => 'string', 'description' => 'Цвет для $accent, #RRGGBB'],
                        'dark' => ['type' => 'boolean', 'description' => 'Тёмные токены ($bg, $text…)'],
                        'into' => ['type' => 'string', 'description' => 'id фрейма, внутрь которого добавить (необязательно; без него — новый макет справа от остальных)'],
                    ],
                    'required' => ['spec'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'run_command',
                'description' => 'Выполнить команду редактора с заданными параметрами. Диалогов нет: всё задаётся параметрами. '
                    . 'Параметры бери из описания params. Действие попадает в историю и отменяется (Ctrl+Z). '
                    . 'Команды создания возвращают id нового слоя — используй его дальше (parent, ids).',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'id' => ['type' => 'string', 'description' => 'id команды, например frame.create, text.create, node.set, layout.add'],
                        'params' => ['type' => 'object', 'description' => 'Параметры команды (JSON-объект). Можно не передавать — тогда значения по умолчанию.'],
                    ],
                    'required' => ['id'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'open_command',
                'description' => 'Выбрать пункт меню так, как будто пользователь щёлкнул по нему сам: открываются панели и окна, если они у команды есть. '
                    . 'Используй, когда пользователь хочет настроить сам.',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'id' => ['type' => 'string', 'description' => 'id команды из find_commands'],
                    ],
                    'required' => ['id'],
                ],
            ],
        ],
        [
            'type' => 'function',
            'function' => [
                'name' => 'undo',
                'description' => 'Отменить последние действия (как Ctrl+Z).',
                'parameters' => [
                    'type' => 'object',
                    'properties' => [
                        'steps' => ['type' => 'integer', 'description' => 'Сколько шагов отменить, по умолчанию 1', 'minimum' => 1, 'maximum' => 20],
                    ],
                ],
            ],
        ],
    ];
}

/** Системная инструкция. $mode: 'advice' (Совет) или 'act' (Сделай). */
function studio_system_prompt(string $mode): string
{
    $available = $mode === 'act' ? array_merge(studio_read_tools(), studio_act_tools()) : studio_read_tools();
    $catalog = studio_tool_catalog($available);

    $common = <<<TXT
Ты — встроенный помощник AI-Figma, редактора интерфейсов, устроенного как Figma: фреймы, автолейаут, компоненты и варианты,
стили и переменные, прототипы, режим разработчика; интерфейс на русском. Файлы пользователя хранятся на его сервере («Мои файлы»).
Пользователь работает в редакторе прямо сейчас. К его сообщению приложено состояние программы, а иногда снимок экрана.

Как отвечать:
- Всегда по-русски, коротко и по делу: 1–6 предложений или короткий нумерованный список шагов.
- Пункты меню пиши так: «Объект › Добавить автолейаут». Горячие клавиши — в скобках: (Shift+A). Сочетания — как в Figma:
  фрейм (F), прямоугольник (R), эллипс (O), текст (T), перо (P), автолейаут (Shift+A), компонент (Ctrl+Alt+K), группа (Ctrl+G).
- Названия команд бери из find_commands, а не по памяти: в AI-Figma они могут немного отличаться от Figma.
- Если не уверен, что видишь на снимке, — так и скажи. Не выдумывай функций, которых нет.
- Сохранение: Ctrl+S сохраняет файл в «Мои файлы» на сервере (значок папки в панели помощника). Файлы .fig из Figma открываются
  с ограничениями; надёжнее — экспорт из Figma в SVG или JSON через REST API.

Твои инструменты (других нет — ни computer_use, ни кликов по координатам):
{$catalog}
Вызывай их штатно. Если штатный вызов недоступен, напиши вызов текстом, по одному блоку на вызов:
<tool_call><function=ИМЯ><parameter=КЛЮЧ>ЗНАЧЕНИЕ</parameter></function></tool_call>
Значения-объекты и списки пиши в JSON. После блока ничего не пиши — дождись результата.
TXT;

    if ($mode === 'act') {
        return $common . "\n\n" . <<<TXT
Режим «Сделай»: ты сам собираешь и меняешь макет в редакторе с помощью инструментов.
Это главное правило: не объясняй пользователю, как сделать вручную, — сделай сам. Если раньше в разговоре
ты был в режиме «Совет» и писал, что не можешь ничего менять, — это больше не так: сейчас режим «Сделай».
Каждое сообщение пользователя начинается с пометки текущего режима — верь ей.
Порядок работы:
1. Пойми задачу. Если она неоднозначна и ошибка дорого стоит — задай один уточняющий вопрос.
2. Посмотри состояние (оно приложено к сообщению; свежее — get_state): страница, фреймы и их размеры, выделение.
3. НОВОЕ создавай так (надёжно, одним шагом):
   - похожее на готовое (вход, профиль, корзина, лендинг, тарифы, карточка товара, пост, слайд…) — insert_template, потом поправь тексты и цвета;
   - своё — build_design с деревом целиком. Пример кнопки:
     {"type":"frame","name":"Кнопка","layout":"horizontal","padding":[14,24,14,24],"cornerRadius":12,"fill":"$accent","mainAlign":"center",
      "children":[{"type":"text","text":"Купить","fontSize":16,"fontStyle":"Semi Bold","fill":"$onAccent"}]}
   - экран телефона — frame w 393, h 852, layout vertical; страница сайта — w 1440. Детям, которые должны тянуться по ширине, — "sizingH":"fill".
   Не собирай новое из отдельных run_command: так легко ошибиться в id родителя.
   МЕНЯЙ существующее командами run_command. Координаты — в пикселях; x, y детей — относительно родительского фрейма. Частые случаи:
   - экран: frame.create {preset?: "iPhone 16", x?, y?, width?, height?, name?, props?} → id фрейма;
   - фигуры: shape.rectangle / shape.ellipse {x, y, width, height, parent?, props?}; линия shape.line {x, y, width};
   - текст: text.create {text, x, y, parent?, width?, props: {fontSize, fontStyle: "Bold", fill: "#111111"}};
   - свойства слоёв: node.set {ids: [...], fill: "#hex" | "none", stroke, strokeWeight, cornerRadius, opacity, name, width, height, x, y,
     fontSize, fontStyle, characters, textAlign …}; тень: effect.add {ids, type: "dropShadow"};
   - автолейаут: layout.add {ids, direction: "vertical"|"horizontal"}, затем node.set {ids, gap, padding, mainAlign, crossAlign, sizingH, sizingV};
     внутри автолейаута новые слои добавляй с parent: id фрейма — они встанут по порядку сами;
   - выделение: select.set {ids}; группировка: object.group {ids}; компонент: component.create {ids}; удаление: edit.delete {ids};
   - выравнивание: align.left / align.hcenter / align.vcenter … {ids}; распределение: distribute.horizontal {ids, spacing?};
   - прототип: proto.interaction.add {id (кнопка), trigger: {type: "onClick"}, action: {type: "navigate", dest: id фрейма-экрана}}.
   Автолейаут-свойства (gap, padding, mainAlign, crossAlign) есть только у фреймов, не у прямоугольников и текста.
   Вкладывать слои (parent) можно только во фреймы. Если не знаешь id команды или её параметры — find_commands. Свойства слоя целиком — inspect_layer.
4. Собирай аккуратно: выравнивай по сетке 4/8 px, используй автолейаут для кнопок, карточек и списков, давай слоям понятные имена.
5. После заметных изменений посмотри на результат (look_at_screen) и коротко скажи, что сделал и как отменить (Ctrl+Z).
Правила безопасности:
- Не закрывай файлы, не удаляй страницы, слои и стили, если пользователь прямо об этом не просил.
- Делай не больше 10 действий подряд; если задача больше — сделай часть и спроси, продолжать ли.
- Если команда вернула ошибку — не повторяй вслепую: прочитай ошибку и params_doc, поправь параметры или объясни, что мешает.
TXT;
    }

    return $common . "\n\n" . <<<TXT
Режим «Совет»: ты только объясняешь и подсказываешь, ничего не меняешь сам.
Можно искать команды (find_commands), смотреть состояние (get_state, inspect_layer) и экран (look_at_screen).
Объясняй, куда нажать и что выставить, с конкретными числами, если они уместны.
Если пользователь просит собрать или изменить что-то за него — скажи, что для этого нужно переключиться в режим «Сделай» (кнопка вверху панели).
TXT;
}

/**
 * Каталог инструментов текстом — для системной подсказки. Некоторые шлюзы (например, vLLM без
 * парсера вызовов) не передают модели поле tools; тогда модель узнаёт о наших инструментах
 * только отсюда и пишет вызовы текстом.
 */
function studio_tool_catalog(array $tools): string
{
    $lines = [];
    foreach ($tools as $t) {
        $f = $t['function'] ?? [];
        $name = (string)($f['name'] ?? '');
        if ($name === '') {
            continue;
        }
        $params = [];
        foreach (($f['parameters']['properties'] ?? []) as $p => $spec) {
            $params[] = $p . ': ' . ($spec['type'] ?? 'string');
        }
        $lines[] = '- ' . $name . '(' . implode(', ', $params) . ') — ' . (string)($f['description'] ?? '');
    }
    return implode("\n", $lines);
}

/**
 * Вызовы инструментов, которые модель написала текстом, а не штатным полем tool_calls:
 *   <tool_call><function=ИМЯ><parameter=КЛЮЧ>ЗНАЧЕНИЕ</parameter>…</function></tool_call>  (Qwen)
 *   <tool_call>{"name": "ИМЯ", "arguments": {…}}</tool_call>                             (Hermes)
 * Возвращает [вызовы, текст без этих блоков].
 */
function studio_text_tool_calls(string $content): array
{
    $calls = [];
    $value = static function (string $raw) {
        $raw = trim($raw);
        $j = json_decode($raw, true);
        return ($j !== null || $raw === 'null') ? $j : $raw;
    };
    // Qwen XML: с обёрткой <tool_call> или без неё. Прокси с vLLM иногда «съедает» начало
    // вызова («<tool_call>\n<»), и приходит «function=run_command>…» — это тоже понимаем,
    // как и вызов без закрывающих тегов в конце ответа.
    if (preg_match_all('~(?:<tool_call>\s*)?<?function=([A-Za-z0-9_.\-]+)>(.*?)(?:</function>(?:\s*</tool_call>)?|(?=<?function=[A-Za-z0-9_.\-]+>)|\z)~s', $content, $m, PREG_SET_ORDER)) {
        foreach ($m as $one) {
            $args = [];
            if (preg_match_all('~<?parameter=([A-Za-z0-9_.\-]+)>(.*?)(?:</parameter>|(?=<?parameter=[A-Za-z0-9_.\-]+>)|(?=</function>)|\z)~s', $one[2], $pm, PREG_SET_ORDER)) {
                foreach ($pm as $p) {
                    $args[$p[1]] = $value($p[2]);
                }
            }
            $calls[] = ['function' => ['name' => $one[1], 'arguments' => $args ?: new stdClass()]];
            $content = str_replace($one[0], '', $content);
        }
    }
    // Hermes: JSON внутри <tool_call>.
    if (preg_match_all('~<tool_call>\s*(\{.*?\})\s*</tool_call>~s', $content, $m, PREG_SET_ORDER)) {
        foreach ($m as $one) {
            $j = json_decode($one[1], true);
            if (is_array($j) && isset($j['name'])) {
                $args = $j['arguments'] ?? ($j['parameters'] ?? []);
                if (is_string($args)) {
                    $args = json_decode($args, true) ?: [];
                }
                $calls[] = ['function' => ['name' => (string)$j['name'], 'arguments' => $args ?: new stdClass()]];
                $content = str_replace($one[0], '', $content);
            }
        }
    }
    // Рассуждения модели в ответ не нужны.
    $content = preg_replace('~<think>.*?</think>~s', '', $content) ?? $content;
    $content = trim(str_replace(['<tool_call>', '</tool_call>'], '', $content));
    return [$calls, $content];
}

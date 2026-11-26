import React from 'react';

// Safe URL check: only allow http:, https:, mailto:, or relative paths /
export const isSafeUrl = (url: string): boolean => {
  if (!url) return false;
  const trimmed = url.trim();
  return (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('/')
  );
};

export const stripFormatting = (text: string): string => {
  if (!text) return '';
  return text
    // Replace markdown links with just label: [label](url) -> label
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/|mailto:|\/)[^\s)]+\)/g, '$1')
    // Remove bold: **bold** -> bold
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    // Remove underline tags or tildes: <u>text</u> -> text, ~text~ -> text
    .replace(/<\/?u>/gi, '')
    .replace(/~([^~\n]+)~/g, '$1')
    // Remove italic: *italic* -> italic, _italic_ -> italic
    .replace(/\*([^*\n]+)\*/g, '$1')
    .replace(/_([^_\n]+)_/g, '$1')
    .trim();
};

const createRegex = () =>
  /(\[(?<linkLabel>[^\]\n]+)\]\((?<linkUrl>(?:https?:\/\/|mailto:|\/)[^\s)]+)\))|(?<autoUrl>https?:\/\/[^\s<]+[^<.,:;"')\]\s])|(`(?<inlineCode>[^`\n]+)`)|(\*\*(?<boldText>[^*\n]+)\*\*)|(<u>(?<underlineText1>[\s\S]*?)<\/u>|~(?<underlineText2>[^~\n]+)~)|(\*(?<italicText1>[^*\n]+)\*|_(?<italicText2>[^_\n]+)_)/g;

export const parseLine = (line: string, depth = 0): React.ReactNode[] => {
  if (!line) return [];
  if (depth > 3) return [line];

  const regex = createRegex();
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(line)) !== null) {
    const matchStart = match.index;
    const matchEnd = regex.lastIndex;

    if (matchStart > lastIndex) {
      elements.push(line.substring(lastIndex, matchStart));
    }

    const groups = match.groups || {};
    const key = `${depth}-${matchStart}-${matchEnd}`;

    if (groups.linkLabel && groups.linkUrl) {
      const url = groups.linkUrl.trim();
      if (isSafeUrl(url)) {
        elements.push(
          React.createElement(
            'a',
            {
              key,
              href: url,
              target: '_blank',
              rel: 'noopener noreferrer',
              onClick: (e: React.MouseEvent) => e.stopPropagation(),
              style: {
                color: 'var(--primary, #3b82f6)',
                textDecoration: 'underline',
                wordBreak: 'break-all',
              },
            },
            parseLine(groups.linkLabel, depth + 1)
          )
        );
      } else {
        elements.push(groups.linkLabel);
      }
    } else if (groups.autoUrl) {
      const url = groups.autoUrl.trim();
      elements.push(
        React.createElement(
          'a',
          {
            key,
            href: url,
            target: '_blank',
            rel: 'noopener noreferrer',
            onClick: (e: React.MouseEvent) => e.stopPropagation(),
            style: {
              color: 'var(--primary, #3b82f6)',
              textDecoration: 'underline',
              wordBreak: 'break-all',
            },
          },
          url
        )
      );
    } else if (groups.inlineCode) {
      elements.push(
        React.createElement(
          'code',
          {
            key,
            className: 'md-inline-code',
          },
          groups.inlineCode
        )
      );
    } else if (groups.boldText) {
      elements.push(
        React.createElement(
          'strong',
          { key, style: { fontWeight: 600 } },
          parseLine(groups.boldText, depth + 1)
        )
      );
    } else if (groups.underlineText1 !== undefined || groups.underlineText2 !== undefined) {
      const content = groups.underlineText1 ?? groups.underlineText2;
      elements.push(
        React.createElement(
          'u',
          { key, style: { textDecoration: 'underline' } },
          parseLine(content, depth + 1)
        )
      );
    } else if (groups.italicText1 || groups.italicText2) {
      const content = groups.italicText1 || groups.italicText2;
      elements.push(
        React.createElement(
          'em',
          { key, style: { fontStyle: 'italic' } },
          parseLine(content, depth + 1)
        )
      );
    }

    lastIndex = matchEnd;
    if (match.index === regex.lastIndex) {
      regex.lastIndex++;
    }
  }

  if (lastIndex < line.length) {
    elements.push(line.substring(lastIndex));
  }

  return elements;
};

export const renderFormattedText = (
  text: string,
  options?: { inline?: boolean }
): React.ReactNode => {
  if (!text) return null;

  if (options?.inline) {
    const singleLine = text.replace(/\n+/g, ' ');
    return React.createElement(React.Fragment, null, parseLine(singleLine));
  }

  const lines = text.split('\n');
  const renderedNodes: React.ReactNode[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) {
      renderedNodes.push(React.createElement('br', { key: `br-${idx}` }));
    }
    const parsed = parseLine(line);
    renderedNodes.push(React.createElement(React.Fragment, { key: `line-${idx}` }, parsed));
  });

  return React.createElement(React.Fragment, null, renderedNodes);
};

export interface FormattedTextProps {
  text: string;
  className?: string;
  style?: React.CSSProperties;
  inline?: boolean;
}

export const FormattedText: React.FC<FormattedTextProps> = ({
  text,
  className,
  style,
  inline = false,
}) => {
  if (!text) return null;
  return React.createElement(
    'span',
    { className, style },
    renderFormattedText(text, { inline })
  );
};

/**
 * Renders block-level Markdown (headings, bullet lists, numbered lists, blockquotes,
 * horizontal rules, and paragraphs) with inline formatting (bold, italic, underline,
 * inline code, links).
 */
export const renderMarkdownBlocks = (markdown: string): React.ReactNode => {
  if (!markdown) return null;

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal rule: --- or ***
    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push(React.createElement('hr', { key: `hr-${i}`, className: 'md-hr' }));
      i++;
      continue;
    }

    // Headings: # to ####
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const content = headingMatch[2];
      const tag = level === 1 ? 'h3' : level === 2 ? 'h4' : 'h5';
      blocks.push(
        React.createElement(
          tag,
          { key: `h-${i}`, className: `md-heading md-h${level}` },
          parseLine(content)
        )
      );
      i++;
      continue;
    }

    // Unordered list: - item or * item
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      const startKey = i;
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, '');
        items.push(
          React.createElement('li', { key: `ul-li-${i}`, className: 'md-li' }, parseLine(itemText))
        );
        i++;
      }
      blocks.push(
        React.createElement('ul', { key: `ul-${startKey}`, className: 'md-ul' }, items)
      );
      continue;
    }

    // Ordered list: 1. item
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: React.ReactNode[] = [];
      const startKey = i;
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '');
        items.push(
          React.createElement('li', { key: `ol-li-${i}`, className: 'md-li' }, parseLine(itemText))
        );
        i++;
      }
      blocks.push(
        React.createElement('ol', { key: `ol-${startKey}`, className: 'md-ol' }, items)
      );
      continue;
    }

    // Blockquote: > text
    if (/^>\s*/.test(trimmed)) {
      const quoteLines: string[] = [];
      const startKey = i;
      while (i < lines.length && /^>\s*/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      blocks.push(
        React.createElement(
          'blockquote',
          { key: `bq-${startKey}`, className: 'md-blockquote' },
          renderFormattedText(quoteLines.join('\n'))
        )
      );
      continue;
    }

    // Paragraph (consecutive non-empty normal lines)
    const paraLines: string[] = [];
    const startKey = i;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(-{3,}|\*{3,})$/.test(lines[i].trim()) &&
      !/^(#{1,4})\s+/.test(lines[i].trim()) &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^>\s*/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(
      React.createElement(
        'p',
        { key: `p-${startKey}`, className: 'md-paragraph task-info-modal-text' },
        renderFormattedText(paraLines.join('\n'))
      )
    );
  }

  return React.createElement('div', { className: 'md-content' }, blocks);
};

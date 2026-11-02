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
  /(\[(?<linkLabel>[^\]\n]+)\]\((?<linkUrl>(?:https?:\/\/|mailto:|\/)[^\s)]+)\))|(?<autoUrl>https?:\/\/[^\s<]+[^<.,:;"')\]\s])|(\*\*(?<boldText>[^*\n]+)\*\*)|(<u>(?<underlineText1>[\s\S]*?)<\/u>|~(?<underlineText2>[^~\n]+)~)|(\*(?<italicText1>[^*\n]+)\*|_(?<italicText2>[^_\n]+)_)/g;

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

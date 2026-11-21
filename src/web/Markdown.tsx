import { Fragment } from 'react';
import type { ReactNode } from 'react';
import type { Token, Tokens } from 'marked';
import { isSafeLink, lexNotes } from './block.ts';

type Props = { source: string; onToggle: (index: number) => void };

/**
 * A description's Markdown as React elements. Nothing goes through innerHTML and raw HTML shows as text,
 * because the agent can write descriptions too. Ticking a checklist box calls onToggle with its index from the top.
 */
export function Markdown({ source, onToggle }: Props) {
  let boxes = 0;
  const render = (tokens: Token[] = []): ReactNode[] =>
    tokens.map((t, i) => {
      switch (t.type) {
        case 'heading': {
          const H = `h${Math.min(t.depth + 2, 6)}` as 'h3'; // the dialog's own title is the h2
          return <H key={i}>{render(t.tokens)}</H>;
        }
        case 'paragraph': return <p key={i}>{render(t.tokens)}</p>;
        case 'text': return t.tokens ? <Fragment key={i}>{render(t.tokens)}</Fragment> : t.text;
        case 'list': {
          const List = t.ordered ? 'ol' : 'ul';
          return (
            <List key={i} start={t.start || undefined}>
              {t.items.map((item: Tokens.ListItem, j: number) => (
                <li key={j} className={item.task ? (item.checked ? 'task done' : 'task') : undefined}>{render(item.tokens)}</li>
              ))}
            </List>
          );
        }
        case 'checkbox': {
          const index = boxes++;
          return <input key={i} type="checkbox" checked={t.checked} onChange={() => onToggle(index)} />;
        }
        case 'strong': return <strong key={i}>{render(t.tokens)}</strong>;
        case 'em': return <em key={i}>{render(t.tokens)}</em>;
        case 'del': return <del key={i}>{render(t.tokens)}</del>;
        case 'codespan': return <code key={i}>{t.text}</code>;
        case 'code': case 'table': return <pre key={i}>{t.type === 'code' ? t.text : t.raw}</pre>;
        case 'blockquote': return <blockquote key={i}>{render(t.tokens)}</blockquote>;
        case 'link': case 'image': // an image shows as a link to it, so a description never loads anything by itself
          return isSafeLink(t.href)
            ? <a key={i} href={t.href} target="_blank" rel="noopener noreferrer">{t.text ? render(t.tokens) : t.href}</a>
            : <Fragment key={i}>{render(t.tokens)}</Fragment>;
        case 'html': return t.block ? <p key={i}>{t.text}</p> : t.text;
        case 'br': return <br key={i} />;
        case 'hr': return <hr key={i} />;
        case 'space': return null;
        default: return 'text' in t ? t.text : null; // escaped characters
      }
    });
  return <div className="md">{render(lexNotes(source))}</div>;
}

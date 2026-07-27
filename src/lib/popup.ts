import type { Stop } from '../data/types';
import { googleMapsUrl } from '../data/trip';
import { escapeXml } from './charts';
import { formatDuration, formatTime, formatTimestamp } from './format';

/**
 * Popup HTML for a stop. Verified names may link to Google Maps; unverified
 * labels are approximate locality descriptions and are presented as such,
 * with no link (see raw/DATASET.md).
 */
export function stopPopupHtml(stop: Stop): string {
  const parts: string[] = ['<div class="stop-popup">'];
  if (stop.overnight) {
    parts.push('<span class="popup-overnight">Overnatting</span>');
  }
  parts.push(`<h3>${escapeXml(stop.label)}</h3>`);
  parts.push(
    `<p class="popup-muni">${escapeXml(stop.municipality)} kommune</p>`,
  );
  parts.push(
    `<p class="popup-times">Ankomst ${escapeXml(formatTimestamp(stop.start))}<br>` +
      `Avreise ${escapeXml(formatTimestamp(stop.end))}<br>` +
      `Varighet ${escapeXml(formatDuration(stop.durationMin))}</p>`,
  );
  const url = googleMapsUrl(stop);
  if (url) {
    parts.push(
      `<a href="${escapeXml(url)}" target="_blank" rel="noopener noreferrer">Åpne i Google Maps</a>`,
    );
  } else {
    parts.push(
      '<p class="popup-note">Omtrentlig stedsangivelse – ikke et bekreftet stedsnavn.</p>',
    );
  }
  parts.push('</div>');
  return parts.join('');
}

/**
 * Popup for a day's starting point: the campsite the family woke up at,
 * derived from the previous evening's overnight stop. Same verified/unverified
 * link rules as regular stop popups.
 */
export function wakeupPopupHtml(stop: Stop): string {
  const parts: string[] = ['<div class="stop-popup wakeup-popup">'];
  parts.push('<span class="popup-wakeup">Dagens start</span>');
  parts.push(`<h3>${escapeXml(stop.label)}</h3>`);
  parts.push(
    `<p class="popup-muni">${escapeXml(stop.municipality)} kommune</p>`,
  );
  parts.push(
    `<p class="popup-times">Våknet her etter overnatting<br>` +
      `Avreise ${escapeXml(formatTime(stop.end))}</p>`,
  );
  const url = googleMapsUrl(stop);
  if (url) {
    parts.push(
      `<a href="${escapeXml(url)}" target="_blank" rel="noopener noreferrer">Åpne i Google Maps</a>`,
    );
  } else {
    parts.push(
      '<p class="popup-note">Omtrentlig stedsangivelse – ikke et bekreftet stedsnavn.</p>',
    );
  }
  parts.push('</div>');
  return parts.join('');
}

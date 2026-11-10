// Reading proposals and results from the Republic's public Congress API.
import axios from 'axios';

export const CONGRESS_API = 'https://martianrepublic.org/api/congress';
export const BALLOT_SERVER = 'wss://martianrepublic.org/wss/ballot';

export const tierColors = { signal: '#34d399', operational: '#00e4ff', legislative: '#f59e0b', constitutional: '#c84125' };

// Counts and percentages computed from the vote counts. The percentage fields
// in the list and detail responses read zero whenever one side has no votes.
export function tally(proposal) {
  const yes = Number(proposal?.yays) || 0;
  const no = Number(proposal?.nays) || 0;
  const total = yes + no;
  const yesPercent = total ? Math.round((yes / total) * 100) : 0;
  return { yes, no, total, yesPercent, noPercent: total ? 100 - yesPercent : 0 };
}

export const isVotingOpen = proposal =>
  ['voting', 'voting_extended'].includes(proposal?.phase) && !!proposal?.txid && !!proposal?.ipfs_hash;

// The API reports times in UTC without a zone marker.
export function parseServerTime(value) {
  if (!value) return null;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function timeLeft(value, now = Date.now()) {
  const end = parseServerTime(value);
  if (!end) return null;
  const minutes = Math.floor((end.getTime() - now) / 60000);
  if (minutes < 0) return 'closed';
  if (minutes < 60) return `${Math.max(minutes, 1)} min left`;
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)} h left`;
  return `${Math.floor(minutes / 1440)} sols left`;
}

// Voters gather during the first quarter of every hour, the same convention
// the website shows, so that three citizens are present for a round.
export function ballotWindow(now = new Date()) {
  const minute = now.getMinutes();
  return minute < 15 ? { open: true, minutesLeft: 15 - minute } : { open: false, minutesUntil: 60 - minute };
}

export async function fetchProposal(id) {
  const response = await axios.get(`${CONGRESS_API}/proposals/${id}`, { timeout: 15000 });
  if (!response.data?.proposal) throw new Error('Proposal not found.');
  return response.data;
}

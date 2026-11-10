// Feed entries can repeat a person when both citizenship and public status have
// records. Keep the newest entry for each public identity in directory views.
export function uniqueCitizens(entries) {
  const seen = new Set();
  return entries.filter(entry => {
    const key = entry.address || entry.citizen?.public_address || entry.userid || entry.id;
    if (key === undefined) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

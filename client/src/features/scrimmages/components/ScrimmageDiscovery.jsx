import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { scrimmagesApi } from '../api/scrimmagesApi';
import { DiscoverSearchBar } from '../../../components/DiscoverSearchBar';
import { SportsLoader } from '../../../components/SportsLoader';
export function ScrimmageDiscovery() {
  const [query, setQuery] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['publicScrimmages'],
    queryFn: scrimmagesApi.list,
  });
  const records = (data?.scrimmages || []).filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase())
  );
  return (
    <div>
      <DiscoverSearchBar
        label="Search scrimmages"
        placeholder="Search scrimmages"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        sticky
      />
      {isLoading ? (
        <SportsLoader label="Loading scrimmages" />
      ) : error ? (
        <p role="alert">{error.message}</p>
      ) : !records.length ? (
        <p role="status" className="mt-4 rounded-xl border border-dashed p-4 text-slate-600">
          No scrimmages match your search.
        </p>
      ) : (
        <ul className="mt-4 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-3">
          {records.map((s) => (
            <li key={s.id}>
              <Link
                to={`${s.canManage ? '/admin' : ''}/scrimmage/${s.id}`}
                className="block rounded-xl border border-slate-200 bg-slate-50 p-5 hover:border-[#F4A300]"
              >
                <h3 className="text-lg font-semibold">{s.name}</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Weekly sessions, player stats & MVP standings
                </p>
                <span className="mt-3 block text-sm font-semibold underline">View scrimmage →</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

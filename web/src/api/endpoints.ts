import { useQuery } from '@tanstack/react-query';
import { fetchJSON } from './client';

// ---- Types ----
export interface Song {
  song_id: string; name: string; artist_name: string; artist_id: string;
  album: string; year: number; duration_sec: number; pop: number;
  comment_total: number; total_liked: number; topic_name: string; emotions: string;
}
export interface Artist {
  artist_id: string; artist_name: string; song_num: number; comments: number;
  likes: number; avg_pop: number; influence: number; style_words: string;
  photo: string; authentic: number;
}
export interface LyricRow { song_id: string; name: string; artist_name: string; year: number; topic_name: string; word_count: number; frag: string; }
export interface CommentRow { song_id: string; name: string; artist_name: string; content: string; liked: number; time: string; sentiment: string; }
export interface SongDetail { song: Song; lyric: { lyric: string; topic_name: string; word_count: number } | null; comments: { content: string; liked: number; sentiment: string; time: string }[]; sentiment: { sentiment: string; c: number }[]; }
export interface ArtistDetail { artist: Artist; songs: { song_id: string; name: string; year: number; comment_total: number; pop: number }[]; }
export interface PageResult<T> { total: number; page: number; limit: number; rows: T[]; }
export interface GraphNode { name: string; pagerank: number; degree: number; songs: number; heat: number; community: number; }
export interface GraphEdge { source: string; target: string; weight: number; }
export interface CollabResult { center: string; target: string; songs: Song[]; }

// ---- Search APIs ----
export function useSearchSongs(params: Record<string, string>) {
  return useQuery({ queryKey: ['searchSongs', params], queryFn: () => fetchJSON<PageResult<Song>>('/search/songs', params) });
}
export function useSearchArtists(params: Record<string, string>) {
  return useQuery({ queryKey: ['searchArtists', params], queryFn: () => fetchJSON<PageResult<Artist>>('/search/artists', params) });
}
export function useSearchLyrics(params: Record<string, string>) {
  return useQuery({ queryKey: ['searchLyrics', params], queryFn: () => fetchJSON<PageResult<LyricRow> & { mode: string }>('/search/lyrics', params) });
}
export function useSearchComments(params: Record<string, string>) {
  return useQuery({ queryKey: ['searchComments', params], queryFn: () => fetchJSON<PageResult<CommentRow> & { mode: string }>('/search/comments', params) });
}

export function useSongDetail(id: string) {
  return useQuery({ queryKey: ['song', id], queryFn: () => fetchJSON<SongDetail>('/song/' + id), enabled: !!id });
}
export function useArtistDetail(id: string) {
  return useQuery({ queryKey: ['artist', id], queryFn: () => fetchJSON<ArtistDetail>('/artist/' + encodeURIComponent(id)), enabled: !!id });
}
export function useCollabSongs(a1: string, a2: string) {
  return useQuery({ queryKey: ['collab', a1, a2], queryFn: () => fetchJSON<CollabResult>('/collab-songs', { a1, a2 }), enabled: !!(a1 && a2) });
}
export function useDbStats() {
  return useQuery({ queryKey: ['dbstats'], queryFn: () => fetchJSON<{ songs: number; artists: number; lyrics: number; comments: number }>('/dbstats'), staleTime: Infinity });
}

// ---- Analysis JSON APIs ----
export function useApi<T=any>(name: string) {
  return useQuery({ queryKey: ['api', name], queryFn: () => fetchJSON<T>('/' + name), staleTime: Infinity });
}

// Graph data
export function useGraphNodes() {
  return useQuery({ queryKey: ['graph_nodes'], queryFn: () => fetchJSON<GraphNode[]>('/graph_nodes'), staleTime: Infinity });
}
export function useGraphEdges() {
  return useQuery({ queryKey: ['graph_edges'], queryFn: () => fetchJSON<GraphEdge[]>('/graph_edges'), staleTime: Infinity });
}

// 带年份筛选的排行
export function useRankArtists(ymin?: string, ymax?: string) {
  const params: Record<string, string> = {};
  if (ymin) params.ymin = ymin;
  if (ymax) params.ymax = ymax;
  return useQuery({ queryKey: ['rankArtists', ymin, ymax], queryFn: () => fetchJSON<any[]>('/rank/artists', params) });
}
export function useRankWords(ymin?: string, ymax?: string) {
  const params: Record<string, string> = {};
  if (ymin) params.ymin = ymin;
  if (ymax) params.ymax = ymax;
  return useQuery({ queryKey: ['rankWords', ymin, ymax], queryFn: () => fetchJSON<{ word: string; count: number }[]>('/rank/words', params) });
}

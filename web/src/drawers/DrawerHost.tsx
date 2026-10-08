import React from 'react';
import { Drawer } from 'antd';
import { useDrawer } from '../context/DrawerContext';
import SongDetail from './SongDetail';
import ArtistDetail from './ArtistDetail';
import ArtistNetwork from './ArtistNetwork';
import CollabSongs from './CollabSongs';
import AlbumDetail from './AlbumDetail';
import LyricDetail from './LyricDetail';

const TITLES: Record<string, string> = { song: '歌曲', artist: '歌手', network: '网络', collab: '合作', album: '专辑', lyric: '歌词' };

export default function DrawerHost() {
  const { state, closeDrawer, goBack, history } = useDrawer();
  const { type, data } = state;
  const title = type ? TITLES[type] || '详情' : '详情';

  return (
    <Drawer open={state.open} onClose={closeDrawer} title={title} width={840} placement="right"
      extra={history.length > 0 ? <a onClick={goBack} style={{ color: 'var(--accent)', cursor: 'pointer', fontSize: 13 }}>返回上一级</a> : null}>
      {type === 'song' && <SongDetail songId={data?.songId} fromArtistId={data?.fromArtistId} />}
      {type === 'artist' && <ArtistDetail artistId={data?.artistId} />}
      {type === 'network' && <ArtistNetwork artistName={data?.artistName} />}
      {type === 'collab' && <CollabSongs center={data?.center} target={data?.target} />}
      {type === 'album' && <AlbumDetail albumName={data?.albumName} />}
      {type === 'lyric' && <LyricDetail songId={data?.songId} />}
    </Drawer>
  );
}

import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Spin, Tag, List, Button } from 'antd';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { useApi } from '../api/endpoints';
import { useDrawer } from '../context/DrawerContext';
import { fetchJSON } from '../api/client';

const F = (n: number) => n >= 1e8 ? (n / 1e8).toFixed(1) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : String(n);

// City → Province mapping (same as before - truncated for brevity, full map kept)
const CITY_PROVINCE: Record<string, string> = {
  '北京': '北京市', '上海': '上海市', '天津': '天津市', '重庆': '重庆市',
  '广州': '广东省', '深圳': '广东省', '东莞': '广东省', '佛山': '广东省', '珠海': '广东省', '惠州': '广东省', '湛江': '广东省', '茂名': '广东省', '江门': '广东省', '肇庆': '广东省', '清远': '广东省', '梅州': '广东省', '潮州': '广东省', '揭阳': '广东省', '汕头': '广东省', '汕尾': '广东省', '河源': '广东省', '韶关': '广东省', '云浮': '广东省', '阳江': '广东省',
  '杭州': '浙江省', '宁波': '浙江省', '温州': '浙江省', '嘉兴': '浙江省', '湖州': '浙江省', '绍兴': '浙江省', '金华': '浙江省', '衢州': '浙江省', '舟山': '浙江省', '台州': '浙江省', '丽水': '浙江省',
  '南京': '江苏省', '苏州': '江苏省', '无锡': '江苏省', '常州': '江苏省', '南通': '江苏省', '扬州': '江苏省', '镇江': '江苏省', '泰州': '江苏省', '盐城': '江苏省', '连云港': '江苏省', '徐州': '江苏省', '淮安': '江苏省', '宿迁': '江苏省',
  '成都': '四川省', '绵阳': '四川省', '德阳': '四川省', '宜宾': '四川省', '泸州': '四川省', '南充': '四川省', '广安': '四川省', '遂宁': '四川省', '内江': '四川省', '乐山': '四川省', '眉山': '四川省', '自贡': '四川省', '达州': '四川省', '资阳': '四川省', '广元': '四川省', '雅安': '四川省', '攀枝花': '四川省', '巴中': '四川省', '西昌': '四川省', '都江堰': '四川省',
  '武汉': '湖北省', '襄阳': '湖北省', '宜昌': '湖北省', '荆州': '湖北省', '黄石': '湖北省', '十堰': '湖北省',
  '长沙': '湖南省', '岳阳': '湖南省', '衡阳': '湖南省', '株洲': '湖南省', '湘潭': '湖南省', '郴州': '湖南省', '邵阳': '湖南省', '常德': '湖南省', '益阳': '湖南省', '永州': '湖南省', '怀化': '湖南省', '娄底': '湖南省', '张家界': '湖南省', '凤凰古城': '湖南省',
  '西安': '陕西省', '咸阳': '陕西省', '渭南': '陕西省', '延安': '陕西省', '榆林': '陕西省', '汉中': '陕西省', '安康': '陕西省', '商洛': '陕西省', '铜川': '陕西省',
  '郑州': '河南省', '洛阳': '河南省', '开封': '河南省', '南阳': '河南省', '许昌': '河南省', '新乡': '河南省', '安阳': '河南省',
  '济南': '山东省', '青岛': '山东省', '烟台': '山东省', '威海': '山东省', '潍坊': '山东省', '淄博': '山东省', '临沂': '山东省', '济宁': '山东省', '泰安': '山东省', '聊城': '山东省', '德州': '山东省', '滨州': '山东省', '菏泽': '山东省', '日照': '山东省',
  '昆明': '云南省', '大理': '云南省', '丽江': '云南省', '香格里拉': '云南省', '西双版纳': '云南省',
  '贵阳': '贵州省', '遵义': '贵州省', '安顺': '贵州省', '六盘水': '贵州省', '铜仁': '贵州省', '毕节': '贵州省',
  '合肥': '安徽省', '芜湖': '安徽省', '黄山': '安徽省', '六安': '安徽省', '滁州': '安徽省', '马鞍山': '安徽省', '铜陵': '安徽省', '蚌埠': '安徽省', '亳州': '安徽省', '阜阳': '安徽省', '宿州': '安徽省', '巢湖': '安徽省', '安庆': '安徽省',
  '南昌': '江西省', '九江': '江西省', '赣州': '江西省', '景德镇': '江西省', '吉安': '江西省', '抚州': '江西省', '上饶': '江西省', '鹰潭': '江西省', '新余': '江西省', '萍乡': '江西省', '宜春': '江西省',
  '福州': '福建省', '厦门': '福建省', '泉州': '福建省', '漳州': '福建省', '莆田': '福建省', '龙岩': '福建省',
  '南宁': '广西壮族自治区', '桂林': '广西壮族自治区', '柳州': '广西壮族自治区', '北海': '广西壮族自治区', '玉林': '广西壮族自治区',
  '海口': '海南省', '三亚': '海南省',
  '兰州': '甘肃省', '天水': '甘肃省', '酒泉': '甘肃省', '张掖': '甘肃省', '武威': '甘肃省', '定西': '甘肃省', '陇南': '甘肃省', '平凉': '甘肃省', '庆阳': '甘肃省', '敦煌': '甘肃省', '嘉峪关': '甘肃省',
  '西宁': '青海省', '格尔木': '青海省', '青海湖': '青海省',
  '银川': '宁夏回族自治区', '固原': '宁夏回族自治区', '吴忠': '宁夏回族自治区', '中卫': '宁夏回族自治区', '石嘴山': '宁夏回族自治区',
  '乌鲁木齐': '新疆维吾尔自治区', '吐鲁番': '新疆维吾尔自治区', '哈密': '新疆维吾尔自治区', '喀什': '新疆维吾尔自治区', '克拉玛依': '新疆维吾尔自治区', '伊犁': '新疆维吾尔自治区', '阿克苏': '新疆维吾尔自治区', '库尔勒': '新疆维吾尔自治区', '和田': '新疆维吾尔自治区', '阿勒泰': '新疆维吾尔自治区',
  '呼和浩特': '内蒙古自治区', '呼伦贝尔': '内蒙古自治区', '包头': '内蒙古自治区', '鄂尔多斯': '内蒙古自治区',
  '哈尔滨': '黑龙江省', '齐齐哈尔': '黑龙江省', '牡丹江': '黑龙江省', '漠河': '黑龙江省', '雪乡': '黑龙江省',
  '长春': '吉林省', '吉林': '吉林省', '长白山': '吉林省',
  '沈阳': '辽宁省', '大连': '辽宁省', '鞍山': '辽宁省', '抚顺': '辽宁省',
  '石家庄': '河北省', '唐山': '河北省', '保定': '河北省', '邯郸': '河北省', '秦皇岛': '河北省', '承德': '河北省',
  '太原': '山西省', '大同': '山西省', '临汾': '山西省', '长治': '山西省',
  '拉萨': '西藏自治区', '日喀则': '西藏自治区', '纳木错': '西藏自治区', '布达拉宫': '西藏自治区', '珠穆朗玛': '西藏自治区',
  '香港': '香港特别行政区', '澳门': '澳门特别行政区',
  '台北': '台湾省', '高雄': '台湾省', '台中': '台湾省', '台南': '台湾省',
  '黄河': '青海省', '长江': '湖北省', '长城': '北京市', '西湖': '浙江省', '故宫': '北京市', '天安门': '北京市',
  '长安': '陕西省', '金陵': '江苏省', '姑苏': '江苏省', '临安': '浙江省', '汴梁': '河南省', '燕京': '北京市',
  '天涯海角': '海南省', '鼓浪屿': '福建省', '外滩': '上海市', '秦淮河': '江苏省', '夫子庙': '江苏省',
  '黄鹤楼': '湖北省', '岳麓山': '湖南省', '橘子洲': '湖南省', '春熙路': '四川省', '洪崖洞': '重庆市',
  '解放碑': '重庆市', '大雁塔': '陕西省', '兵马俑': '陕西省', '中山陵': '江苏省', '玄武湖': '江苏省',
  '洞庭湖': '湖南省', '鄱阳湖': '江西省', '太湖': '江苏省',
  '玉龙雪山': '云南省', '苍山': '云南省', '洱海': '云南省', '泸沽湖': '云南省',
  '九寨沟': '四川省', '黄龙': '四川省', '峨眉山': '四川省', '乐山大佛': '四川省', '青城山': '四川省',
  '泰山': '山东省', '华山': '陕西省', '衡山': '湖南省', '恒山': '山西省', '嵩山': '河南省', '庐山': '江西省', '井岗山': '江西省', '武夷山': '福建省',
  '漓江': '广西壮族自治区', '阳朔': '广西壮族自治区', '黄果树': '贵州省',
  '平遥古城': '山西省', '周庄': '江苏省', '同里': '江苏省', '西塘': '浙江省', '乌镇': '浙江省', '宏村': '安徽省', '婺源': '江西省',
  '莫高窟': '甘肃省', '鸣沙山': '甘肃省', '月牙泉': '甘肃省', '张掖丹霞': '甘肃省', '可可西里': '青海省',
  '满洲里': '内蒙古自治区', '北极村': '黑龙江省', '天池': '吉林省', '镜泊湖': '黑龙江省', '五大连池': '黑龙江省', '太阳岛': '黑龙江省', '亚布力': '黑龙江省',
  '大兴安岭': '黑龙江省', '太行山': '山西省', '秦岭': '陕西省', '横断山': '云南省', '梅里雪山': '云南省', '冈仁波齐': '西藏自治区', '雅鲁藏布': '西藏自治区', '喀纳斯': '新疆维吾尔自治区', '赛里木湖': '新疆维吾尔自治区',
  '稻城': '四川省', '亚丁': '四川省', '宽窄巷子': '四川省', '大昭寺': '西藏自治区',
};

// Province → representative city for search
const PROVINCE_SEARCH: Record<string, string> = {
  '北京市': '北京', '上海市': '上海', '天津市': '天津', '重庆市': '重庆',
  '广东省': '广州', '浙江省': '杭州', '江苏省': '南京', '四川省': '成都',
  '湖北省': '武汉', '湖南省': '长沙', '陕西省': '西安', '河南省': '郑州',
  '山东省': '济南', '云南省': '昆明', '贵州省': '贵阳', '安徽省': '合肥',
  '江西省': '南昌', '福建省': '厦门', '广西壮族自治区': '桂林', '海南省': '三亚',
  '甘肃省': '兰州', '青海省': '西宁', '宁夏回族自治区': '银川', '新疆维吾尔自治区': '乌鲁木齐',
  '内蒙古自治区': '呼和浩特', '黑龙江省': '哈尔滨', '吉林省': '长春', '辽宁省': '沈阳',
  '河北省': '石家庄', '山西省': '太原', '西藏自治区': '拉萨',
  '香港特别行政区': '香港', '澳门特别行政区': '澳门', '台湾省': '台北',
};

type PlaceItem = { name: string; value: number };
type SongItem = { song_id: string; name: string; artist_name: string; year: number; comment_total: number; topic_name: string; lyric_snippet: string };

export default function LyricMapView() {
  const { openDrawer } = useDrawer();
  const { data: places } = useApi<PlaceItem[]>('lyric_places');
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selProvince, setSelProvince] = useState<string | null>(null);
  const [selPlace, setSelPlace] = useState<string>('');
  const [songs, setSongs] = useState<SongItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/china.json')
      .then(r => r.json())
      .then(geo => { echarts.registerMap('china', geo); setMapLoaded(true); })
      .catch(() => setMapLoaded(true));
  }, []);

  if (!places || !mapLoaded) return <Spin />;

  const provinceData: Record<string, number> = {};
  const unmatched: PlaceItem[] = [];
  for (const p of places) {
    const prov = CITY_PROVINCE[p.name];
    if (prov) provinceData[prov] = (provinceData[prov] || 0) + p.value;
    else unmatched.push(p);
  }
  const mapData = Object.entries(provinceData).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const maxVal = mapData[0]?.value || 1;

  // Province → places mapping for click handling
  const provPlaces: Record<string, PlaceItem[]> = {};
  for (const p of places) {
    const prov = CITY_PROVINCE[p.name];
    if (prov) { provPlaces[prov] = provPlaces[prov] || []; provPlaces[prov].push(p); }
  }

  const onMapClick = async (params: any) => {
    if (!params.name) return;
    const prov = params.name;
    setSelProvince(prov);
    setLoading(true);
    // Use the province's key city for search
    const searchPlace = PROVINCE_SEARCH[prov] || prov;
    setSelPlace(searchPlace);
    try {
      const res: any = await fetchJSON('/lyric_places/songs', { place: searchPlace });
      setSongs(res.rows || []);
    } catch { setSongs([]); }
    setLoading(false);
  };

  const mapOption = {
    backgroundColor: 'transparent',
    tooltip: { trigger: 'item', formatter: (p: any) => `${p.name}<br/>歌词提及: <b>${p.value ?? 0}</b> 次<br/><span style="font-size:11px;color:#aaa">点击查看歌曲</span>` },
    visualMap: { min: 0, max: maxVal, left: 20, bottom: 20, text: ['高频', '低频'], inRange: { color: ['#e0f3f8', '#abd9e9', '#74add1', '#4575b4', '#313695'] }, calculable: true },
    series: [{
      type: 'map', map: 'china', roam: true, zoom: 1.2, center: [105, 36],
      label: { show: false },
      itemStyle: { borderColor: '#fff', borderWidth: 0.5, areaColor: '#f0f0f0' },
      emphasis: { label: { show: true, color: '#333' }, itemStyle: { areaColor: '#ffb347' } },
      data: mapData,
    }],
  };

  return (
    <Row gutter={[16, 16]}>
      <Col span={24}>
        <Card size="small">
          <h3 style={{ margin: 0, color: 'var(--accent)' }}>🗺️ 歌词地图</h3>
          <div style={{ color: 'var(--text3)', fontSize: 12, marginTop: 4 }}>
            从 {places.length} 个地名 · {mapData.length} 个省份 · 点击省份查看提及歌曲
            {selProvince && <Tag color="red" style={{ marginLeft: 8 }}>{selProvince}</Tag>}
          </div>
        </Card>
      </Col>
      <Col xs={24} lg={selProvince ? 12 : 17}>
        <Card size="small">
          <ReactECharts option={mapOption} style={{ height: 500 }} onEvents={{ click: onMapClick }} />
        </Card>
      </Col>
      {selProvince ? (
        <Col xs={24} lg={7}>
          <Card title={<span>「{selPlace}」提及歌曲 <Tag color="green" style={{ marginLeft: 4 }}>{songs.length}</Tag></span>}
            extra={<Button size="small" onClick={() => { setSelProvince(null); setSongs([]); }}>关闭</Button>}
            size="small" style={{ maxHeight: 520, overflow: 'auto' }}>
            {loading ? <Spin /> : songs.length === 0 ? <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20, textAlign: 'center' }}>暂无数据</div> :
              <List size="small" dataSource={songs} renderItem={(s: SongItem) => (
                <List.Item onClick={() => openDrawer('song', { songId: s.song_id })} style={{ cursor: 'pointer', padding: '6px 0' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13 }}>{s.name}</div>
                    <div style={{ color: 'var(--text2)', fontSize: 11 }}>{s.artist_name} · {s.year || '?'} · {F(s.comment_total)} 评</div>
                    {s.topic_name && <Tag color="purple" style={{ fontSize: 10, marginTop: 2 }}>{s.topic_name}</Tag>}
                  </div>
                </List.Item>
              )} />
            }
          </Card>
        </Col>
      ) : (
        <Col xs={24} lg={7}>
          <Card title="地名排行 Top 20" size="small" style={{ maxHeight: 520, overflow: 'auto' }}>
            {places.slice(0, 20).map((p, i) => (
              <div key={i} onClick={async () => {
                const prov = CITY_PROVINCE[p.name];
                if (prov) onMapClick({ name: prov });
              }} style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid var(--border)', fontSize: 13, color: 'var(--text)' }}>
                <span><b style={{ color: i < 3 ? 'var(--accent)' : 'var(--text2)' }}>{i + 1}</b>. {p.name}</span>
                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{F(p.value)}</span>
              </div>
            ))}
          </Card>
        </Col>
      )}
      <Col span={24}>
        <Card title="全部地名" size="small">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {places.map((p, i) => (
              <Tag key={i} color={i < 5 ? 'red' : i < 15 ? 'blue' : 'default'}
                style={{ fontSize: Math.max(11, 10 + Math.log2(p.value / 5) * 2.5), cursor: 'pointer' }}
                onClick={async () => {
                  const prov = CITY_PROVINCE[p.name];
                  if (prov) onMapClick({ name: prov });
                }}>
                {p.name} {p.value}
              </Tag>
            ))}
          </div>
        </Card>
      </Col>
    </Row>
  );
}

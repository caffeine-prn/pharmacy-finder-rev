// 전역 변수
let map;
let pharmacyData = [];
let allMarkers = [];
let markerClusterGroup;
let currentFilteredData = [];
let herbalPharmacies = [];
let isHerbalFilterActive = false;
let sidoData = [];
let sigunguData = {};
let clusterRadius = 50;
let idToMarker = new Map();
let herbalIdSet = new Set();
let isDenseViewActive = false;
// 렌더 성능 기반 적응 임계값 계산을 위한 상태
let lastRenderMs = 0;
let renderMsAvg = 0;
// 약사 인원 집계 (id -> count)
let pharmacistCountsById = {};
// 교차고용(약사+한약사) 필터 상태
let isCrossEmployFilterActive = false;
// Kakao place 매핑(id -> placeUrl)
let kakaoPlaceById = {};

// 공용 한약사 아이콘 경로 (index.html에서 window.HERBAL_ICON_URL로 오버라이드 가능)
const herbalIconUrl = (typeof window !== 'undefined' && window.HERBAL_ICON_URL) ? window.HERBAL_ICON_URL : 'herbal_pot_icon.svg';
const herbalIconImg = `<img src="${herbalIconUrl}" alt="herbal" width="28" height="28" style="vertical-align: middle;" />`;

// 공용 약국 아이콘 경로 (window.PHARMACY_ICON_URL 우선, 없으면 FA 아이콘 유지)
const pharmacyIconUrl = (typeof window !== 'undefined' && window.PHARMACY_ICON_URL) ? window.PHARMACY_ICON_URL : null;
const pharmacyIconHtml = pharmacyIconUrl 
    ? `<img src="${pharmacyIconUrl}" alt="pharmacy" width="28" height="28" style="vertical-align: middle;" />`
    : '<i class="fas fa-pills" style="color: #ffffff; font-size: 22px;"></i>';

// 지도 초기화
function initMap() {
    // 대한민국 중심 좌표 (서울)
    const koreaCenter = [37.5665, 126.9780];
    
    map = L.map('map').setView(koreaCenter, 7);
    
    // OpenStreetMap 타일 레이어 추가
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 18
    }).addTo(map);
    
    // 마커 클러스터 그룹 초기화 (성능 최적화)
    markerClusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: clusterRadius
    });
    map.addLayer(markerClusterGroup);

    // 줌 변경 시 촘촘히 가드 자동 적용
    map.on('zoomend', function() {
        enforceDenseGuardIfNeeded();
    });
}

// CSV 데이터 로드 및 파싱
async function loadPharmacyData() {
    try {
        const response = await fetch('asset/2.약국정보서비스 2025.6.csv');
        const csvText = await response.text();
        
        // CSV 파싱
        const lines = csvText.split('\n');
        const headers = lines[0].split(',');
        
        pharmacyData = [];
        
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // CSV 행 파싱 (쉼표로 구분하되 따옴표 안의 쉼표는 무시)
            const values = parseCSVLine(line);
            
            if (values.length >= 15) {
                const pharmacy = {
                    id: values[0],
                    name: values[1],
                    category: values[3],
                    sido: values[5],
                    sigungu: values[7],
                    address: values[10],
                    phone: values[11],
                    openDate: values[12],
                    longitude: parseFloat(values[13]),
                    latitude: parseFloat(values[14])
                };
                
                // 유효한 좌표인지 확인
                if (!isNaN(pharmacy.longitude) && !isNaN(pharmacy.latitude) && 
                    pharmacy.longitude !== 0 && pharmacy.latitude !== 0) {
                    pharmacyData.push(pharmacy);
                }
            }
        }
        
        console.log(`총 ${pharmacyData.length}개의 약국 데이터를 로드했습니다.`);
        currentFilteredData = [...pharmacyData];
        
        // 시도/시군구 데이터 추출 및 드롭다운 초기화
        extractRegionData();
        populateDropdowns();
        
        // 한약사 데이터 로드
        await loadHerbalData();
        // 약사 인원 집계 로드
        await loadPharmacistCounts();
        // 카카오 place 매핑 로드(있으면 우선 적용)
        await loadKakaoMappings();
        // 모든 마커 캐시 1회 생성
        buildAllMarkersOnce();
        
        updateStats();
        createMarkers();
        
    } catch (error) {
        console.error('데이터 로드 중 오류 발생:', error);
        alert('약국 데이터를 불러오는 중 오류가 발생했습니다.');
    }
}
// 카카오 place 매핑 로드
async function loadKakaoMappings() {
    try {
        const res = await fetch('asset/kakao_place_mappings.json', { cache: 'no-cache' });
        if (!res.ok) {
            console.debug('[kakao-map] mapping fetch status', res.status);
            kakaoPlaceById = {};
            return;
        }
        const data = await res.json();
        const arr = Array.isArray(data.mappings) ? data.mappings : [];
        const map = {};
        for (const m of arr) {
            if (m && m.id && m.kakaoPlaceUrl) map[m.id] = m.kakaoPlaceUrl;
        }
        kakaoPlaceById = map;
        console.debug('[kakao-map] mapping loaded', Object.keys(kakaoPlaceById).length);
    } catch (e) {
        console.debug('[kakao-map] mapping load failed');
        kakaoPlaceById = {};
    }
}

// 시도/시군구 데이터 추출
function extractRegionData() {
    const sidoSet = new Set();
    sigunguData = {};
    
    pharmacyData.forEach(pharmacy => {
        const sido = pharmacy.sido;
        const sigungu = pharmacy.sigungu;
        
        // 유효한 시도명만 추가 (숫자나 '약국' 제외)
        if (sido && !sido.includes('약국') && !/^\d+$/.test(sido)) {
            sidoSet.add(sido);
            
            // 시군구 데이터 구성
            if (!sigunguData[sido]) {
                sigunguData[sido] = new Set();
            }
            if (sigungu && !sigungu.includes('약국') && !/^\d+$/.test(sigungu)) {
                sigunguData[sido].add(sigungu);
            }
        }
    });
    
    // 시도 데이터를 배열로 변환하고 정렬
    sidoData = Array.from(sidoSet).sort();
    
    // 시군구 데이터를 배열로 변환하고 정렬
    Object.keys(sigunguData).forEach(sido => {
        sigunguData[sido] = Array.from(sigunguData[sido]).sort();
    });
    
    console.log(`시도 ${sidoData.length}개, 시군구 데이터 추출 완료`);
}

// 드롭다운 초기화
function populateDropdowns() {
    const sidoSelect = document.getElementById('sidoSelect');
    
    // 시도 드롭다운 채우기
    sidoSelect.innerHTML = '<option value="">전체 시도</option>';
    sidoData.forEach(sido => {
        const option = document.createElement('option');
        option.value = sido;
        option.textContent = sido;
        sidoSelect.appendChild(option);
    });
}

// 시도 변경 시 시군구 드롭다운 업데이트
function onSidoChange() {
    const sidoSelect = document.getElementById('sidoSelect');
    const sigunguSelect = document.getElementById('sigunguSelect');
    const selectedSido = sidoSelect.value;
    
    // 시군구 드롭다운 초기화
    sigunguSelect.innerHTML = '<option value="">전체 시군구</option>';
    
    if (selectedSido && sigunguData[selectedSido]) {
        sigunguData[selectedSido].forEach(sigungu => {
            const option = document.createElement('option');
            option.value = sigungu;
            option.textContent = sigungu;
            sigunguSelect.appendChild(option);
        });
    }
    
    // 검색 실행 (선택된 지역이 모두 보이도록 뷰 자동 맞춤)
    searchPharmacy(true);
}

// 한약사 데이터 로드
async function loadHerbalData() {
    try {
        const response = await fetch('asset/herbal_pharmacies.json');
        const herbalData = await response.json();
        
        herbalPharmacies = herbalData.herbal_pharmacies;
        console.log(`총 ${herbalPharmacies.length}개의 한약사 약국 데이터를 로드했습니다.`);
        herbalIdSet = new Set(herbalPharmacies.map(h => h.id));
        
    } catch (error) {
        console.error('한약사 데이터 로드 중 오류 발생:', error);
        herbalPharmacies = [];
        herbalIdSet = new Set();
    }
}

// 약사(기타인력코드명 = '약사') 인원 집계 로드
async function loadPharmacistCounts() {
    try {
        const res = await fetch('asset/12.의료기관별상세정보서비스_10_기타인력정보 2025.6_약국만.csv');
        const text = await res.text();
        const lines = text.split('\n');
        if (!lines.length) return;
        const headers = lines[0].split(',');
        const idIdx = headers.indexOf('암호화요양기호');
        const roleIdx = headers.indexOf('기타인력코드명');
        const countIdx = headers.indexOf('기타인력수');
        if (idIdx === -1 || roleIdx === -1 || countIdx === -1) {
            console.warn('Pharmacist counts: required columns not found');
            pharmacistCountsById = {};
            return;
        }
        const map = {};
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const vals = parseCSVLine(line);
            const role = vals[roleIdx];
            if (role !== '약사') continue;
            const pid = vals[idIdx];
            const cnt = parseInt(vals[countIdx] || '0', 10) || 0;
            map[pid] = (map[pid] || 0) + cnt;
        }
        pharmacistCountsById = map;
        console.log(`약사 인원 집계 로드: ${Object.keys(pharmacistCountsById).length}개 약국`);
    } catch (e) {
        console.warn('Pharmacist counts load failed', e);
        pharmacistCountsById = {};
    }
}

// CSV 라인 파싱 (따옴표 처리)
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current.trim());
    return result;
}

// 모든 약국 마커를 1회 생성하여 캐싱
function buildAllMarkersOnce() {
    if (idToMarker.size > 0) return; // 이미 생성됨
    
    const pharmacyIcon = L.divIcon({
        html: pharmacyIconHtml,
        iconSize: [36, 36],
        className: 'pharmacy-marker'
    });
    const herbalPharmacyIcon = L.divIcon({
        html: herbalIconImg,
        iconSize: [36, 36],
        className: 'pharmacy-marker herbal-marker'
    });
    
    pharmacyData.forEach(pharmacy => {
        const isHerbalPharmacy = herbalIdSet.has(pharmacy.id);
        const herbalInfo = isHerbalPharmacy ? herbalPharmacies.find(h => h.id === pharmacy.id) : null;
        const pharmacistCount = pharmacistCountsById[pharmacy.id] || 0;
        const marker = L.marker([pharmacy.latitude, pharmacy.longitude], {
            icon: isHerbalPharmacy ? herbalPharmacyIcon : pharmacyIcon
        });
        const countsHtml = (() => {
            const parts = [];
            if (pharmacistCount > 0) parts.push(`약사 ${pharmacistCount}명`);
            if (isHerbalPharmacy && herbalInfo) parts.push(`한약사 ${herbalInfo.herbal_pharmacist_count}명`);
            const badge = (pharmacistCount > 0 && isHerbalPharmacy && herbalInfo) ? '<span style="margin-left:6px; font-size:0.7rem; color:#6f42c1; background:#f0e8ff; padding:2px 6px; border-radius:6px;">교차고용</span>' : '';
            return parts.length ? `<p style="margin: 5px 0; color: #333333; font-weight: 600;">${parts.join(' · ')} ${badge}</p>` : '';
        })();

        const reportBtn = `<div style="margin-top:10px;"><a href="${buildReportUrl(pharmacy.name, pharmacy.address, pharmacy.phone)}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:6px;background:#ffc107;color:#222;padding:6px 10px;border-radius:8px;text-decoration:none;font-weight:600;"><i class="fas fa-flag"></i> 신고하기</a></div>`;

        const baseAddress = (pharmacy.address || '').split(',')[0];
        const popupContent = `
            <div class="popup-content">
                <h3 style="margin: 0 0 10px 0; color: #333; font-size: 1.1rem;">
                    ${isHerbalPharmacy ? herbalIconImg : pharmacyIconHtml} ${pharmacy.name}
                    ${isHerbalPharmacy ? '<span style="color: #333333; font-size: 0.8rem; margin-left: 5px;">[한약사]</span>' : ''}
                </h3>
                <p style="margin: 5px 0; color: #666;"><i class="fas fa-map-marker-alt"></i> ${pharmacy.address}</p>
                ${pharmacy.phone ? `<p style="margin: 5px 0; color: #666;"><i class="fas fa-phone"></i> ${pharmacy.phone}</p>` : ''}
                <p style="margin: 5px 0; color: #666;"><i class="fas fa-calendar"></i> 개설일: ${formatDate(pharmacy.openDate)}</p>
                <p style="margin: 5px 0; color: #666;"><i class="fas fa-map"></i> ${pharmacy.sido} ${pharmacy.sigungu}</p>
                ${countsHtml}
                <p style="margin: 5px 0;">
                    <a href="https://m.map.naver.com/search?query=${encodeURIComponent(`${pharmacy.name} ${baseAddress}`)}" target="_blank" rel="noopener" style="color:#03C75A; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                        <i class="fas fa-arrow-up-right-from-square"></i> 네이버에서 보기
                    </a>
                </p>
                <p style="margin: 5px 0;">
                    <a href="#" data-kakaotarget="${pharmacy.id}" target="_blank" rel="noopener" style="color:#391B1B; font-weight:600; text-decoration:none; display:inline-flex; align-items:center; gap:6px;">
                        <i class="fas fa-arrow-up-right-from-square"></i> 카카오에서 보기
                    </a>
                </p>
                ${reportBtn}
            </div>`;
        marker.bindPopup(popupContent);
        // 팝업 오픈 시 카카오 place 링크 시도 → 실패 시 검색 링크 (디버그 로그 포함)
        marker.on('popupopen', async () => {
            const a = document.querySelector(`a[data-kakaotarget='${pharmacy.id}']`);
            if (!a) return;
            // 0) 매핑이 있으면 즉시 적용
            const mapped = kakaoPlaceById[pharmacy.id];
            if (mapped) {
                console.debug('[kakao] mapped hit', { id: pharmacy.id, url: mapped });
                a.href = mapped;
                return;
            }
            try {
                const qs = new URLSearchParams({
                    name: pharmacy.name || '',
                    address: pharmacy.address || '',
                    x: String(pharmacy.longitude || ''),
                    y: String(pharmacy.latitude || '')
                }).toString();
                const reqUrl = `/api/kakao-local?${qs}`;
                console.debug('[kakao] request', { id: pharmacy.id, name: pharmacy.name, baseAddress, x: pharmacy.longitude, y: pharmacy.latitude, url: reqUrl });
                const r = await fetch(reqUrl);
                if (r.ok) {
                    const j = await r.json();
                    console.debug('[kakao] response', j);
                    if (j && j.ok && j.placeUrl) {
                        a.href = j.placeUrl;
                        return;
                    }
                }
            } catch(e) {}
            const fallback = `https://map.kakao.com/link/search/${encodeURIComponent(`${pharmacy.name} ${baseAddress}`)}`;
            console.debug('[kakao] fallback link', fallback);
            a.href = fallback;
        });
        marker.pharmacyData = pharmacy;
        idToMarker.set(pharmacy.id, marker);
    });
    console.log(`캐시된 마커 수: ${idToMarker.size}`);
}

// 현재 필터 결과에 맞춰 캐시된 마커만 배치
function createMarkers() {
    const t0 = performance.now();
    markerClusterGroup.clearLayers();
    const markersToShow = [];
    for (const p of currentFilteredData) {
        const m = idToMarker.get(p.id);
        if (m) markersToShow.push(m);
    }
    markerClusterGroup.addLayers(markersToShow);
    allMarkers = markersToShow;
    const t1 = performance.now();
    lastRenderMs = t1 - t0;
    // 지수평활 평균
    renderMsAvg = renderMsAvg === 0 ? lastRenderMs : (renderMsAvg * 0.7 + lastRenderMs * 0.3);
    console.log(`${allMarkers.length}개의 마커를 표시했습니다. 렌더 ${lastRenderMs.toFixed(0)}ms (avg ${renderMsAvg.toFixed(0)}ms)`);
}

// 날짜 포맷팅
function formatDate(dateString) {
    if (!dateString) return '정보 없음';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ko-KR');
    } catch (error) {
        return dateString;
    }
}

// 구글폼 신고 URL 생성 (프리필)
function buildReportUrl(name, address, phone) {
    const base = 'https://docs.google.com/forms/d/e/1FAIpQLSfHBe1ztCW35Go0H1SmCQ0DzedfopwhFPChwD9tx7sYPLVqqA/viewform?usp=pp_url';
    const params = new URLSearchParams();
    // entry.1356240170 = 약국/한약국 상호명
    // entry.1318537606 = 주소
    // entry.1084600480 = 연락처
    params.set('entry.1356240170', name || '');
    params.set('entry.1318537606', address || '');
    params.set('entry.1084600480', phone || '');
    return `${base}&${params.toString()}`;
}

// (간소화) 네이버 링크는 m.map 검색 URL을 사용 (상호+주소)

// 약국 검색
function searchPharmacy(adjustView = false) {
    const searchTerm = document.getElementById('searchInput').value.trim();
    const selectedSido = document.getElementById('sidoSelect').value;
    const selectedSigungu = document.getElementById('sigunguSelect').value;
    
    // 기본 데이터 설정 (한약사 필터 고려)
    let baseData = pharmacyData;
    const herbalPharmacyIds = new Set(herbalPharmacies.map(h => h.id));
    if (isHerbalFilterActive) {
        baseData = baseData.filter(pharmacy => herbalPharmacyIds.has(pharmacy.id));
    }
    if (isCrossEmployFilterActive) {
        baseData = baseData.filter(pharmacy => (pharmacistCountsById[pharmacy.id] || 0) > 0 && herbalPharmacyIds.has(pharmacy.id));
    }
    
    // 필터링 적용
    currentFilteredData = baseData.filter(pharmacy => {
        // 검색어 필터링
        const matchesSearch = !searchTerm || 
            pharmacy.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            pharmacy.address.toLowerCase().includes(searchTerm.toLowerCase());
        
        // 시도 필터링
        const matchesSido = !selectedSido || 
            pharmacy.sido === selectedSido;
        
        // 시군구 필터링
        const matchesSigungu = !selectedSigungu || 
            pharmacy.sigungu === selectedSigungu;
        
        return matchesSearch && matchesSido && matchesSigungu;
    });
    
    createMarkers();
    updateStats();
    updatePharmacyList();
    
    // 명시적 검색일 때만 뷰 자동 맞춤
    if (adjustView && currentFilteredData.length > 0) {
        const bounds = L.latLngBounds(
            currentFilteredData.map(p => [p.latitude, p.longitude])
        );
        map.fitBounds(bounds, { padding: [20, 20] });
    }
}

// 검색 초기화
function clearSearch() {
    document.getElementById('searchInput').value = '';
    document.getElementById('sidoSelect').value = '';
    document.getElementById('sigunguSelect').value = '';
    
    // 시군구 드롭다운 초기화
    document.getElementById('sigunguSelect').innerHTML = '<option value="">전체 시군구</option>';
    
    // 한약사 필터 비활성화
    isHerbalFilterActive = false;
    document.getElementById('herbalFilterBtn').classList.remove('active');
    
    currentFilteredData = [...pharmacyData];
    createMarkers();
    updateStats();
    updatePharmacyList();
    
    // 대한민국 전체 보기
    map.setView([37.5665, 126.9780], 7);
}

// 사이드바 토글
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('show');
    
    if (sidebar.classList.contains('show')) {
        updatePharmacyList();
    }
}

// 통계 업데이트
function updateStats() {
    document.getElementById('totalCount').textContent = pharmacyData.length.toLocaleString();
    document.getElementById('filteredCount').textContent = currentFilteredData.length.toLocaleString();
    document.getElementById('herbalCount').textContent = herbalPharmacies.length.toLocaleString();
}

// 약국 목록 업데이트
function updatePharmacyList() {
    const listContainer = document.getElementById('pharmacyList');
    listContainer.innerHTML = '';
    
    // 한약사 약국 ID 집합 생성
    const herbalPharmacyIds = new Set(herbalPharmacies.map(h => h.id));
    
    // 최대 100개까지만 표시 (성능 최적화)
    const displayData = currentFilteredData.slice(0, 100);
    
    displayData.forEach(pharmacy => {
        const isHerbalPharmacy = herbalPharmacyIds.has(pharmacy.id);
        const herbalInfo = isHerbalPharmacy ? herbalPharmacies.find(h => h.id === pharmacy.id) : null;
        const pharmacistCount = pharmacistCountsById[pharmacy.id] || 0;
        const isCrossEmploy = pharmacistCount > 0 && isHerbalPharmacy && !!herbalInfo;
        
        const item = document.createElement('div');
        item.className = 'pharmacy-item';
        item.innerHTML = `
            <div class="pharmacy-name">
                ${isHerbalPharmacy ? `${herbalIconImg} ` : ''}
                ${pharmacy.name}
                ${isHerbalPharmacy ? '<span style="color: #333333; font-size: 0.7rem; margin-left: 5px;">[한약사]</span>' : ''}
                ${isCrossEmploy ? '<span style="margin-left:6px; font-size:0.7rem; color:#6f42c1; background:#f0e8ff; padding:2px 6px; border-radius:6px;">교차고용</span>' : ''}
            </div>
            <div class="pharmacy-address">${pharmacy.address}</div>
            ${pharmacy.phone ? `<div style="font-size: 0.8rem; color: #888; margin-top: 0.25rem;">${pharmacy.phone}</div>` : ''}
            ${(() => {
                const parts = [];
                if (pharmacistCount > 0) parts.push(`약사 ${pharmacistCount}명`);
                if (isHerbalPharmacy && herbalInfo) parts.push(`한약사 ${herbalInfo.herbal_pharmacist_count}명`);
                const body = parts.join(' · ');
                const btn = `<a href="${buildReportUrl(pharmacy.name, pharmacy.address, pharmacy.phone)}" target="_blank" rel="noopener" style="margin-left:8px; display:inline-flex;align-items:center;gap:4px;background:#ffc107;color:#222;padding:2px 6px;border-radius:6px;text-decoration:none;font-weight:600;"><i class="fas fa-flag"></i> 신고</a>`;
                return parts.length ? `<div style="font-size: 0.8rem; color: #333333; margin-top: 0.25rem; font-weight: 600;">${body} ${btn}</div>` : btn;
            })()}
        `;
        
        // 클릭 시 해당 약국으로 지도 이동
        item.addEventListener('click', () => {
            map.setView([pharmacy.latitude, pharmacy.longitude], 16);
            
            // 해당 마커의 팝업 열기
            const marker = allMarkers.find(m => m.pharmacyData.id === pharmacy.id);
            if (marker) {
                marker.openPopup();
            }
        });
        
        listContainer.appendChild(item);
    });
    
    if (currentFilteredData.length > 100) {
        const moreItem = document.createElement('div');
        moreItem.style.padding = '1rem';
        moreItem.style.textAlign = 'center';
        moreItem.style.color = '#666';
        moreItem.innerHTML = `... 외 ${(currentFilteredData.length - 100).toLocaleString()}개 더`;
        listContainer.appendChild(moreItem);
    }
}

// Enter 키 검색 지원
document.addEventListener('DOMContentLoaded', function() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            searchPharmacy(true);
        }
    });
});

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async function() {
    initMap();
    await loadPharmacyData();
    
    // 로딩 화면 숨기기
    document.getElementById('loading').style.display = 'none';
});

// 클러스터 반경 재설정
function rebuildClusterGroup() {
    if (!map) return;
    // 기존 그룹 제거
    if (markerClusterGroup) {
        map.removeLayer(markerClusterGroup);
    }
    markerClusterGroup = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: clusterRadius
    });
    map.addLayer(markerClusterGroup);
    if (allMarkers && allMarkers.length > 0) {
        markerClusterGroup.addLayers(allMarkers);
    }
}

function onClusterRadiusChange() {
    const range = document.getElementById('clusterRadiusRange');
    const valueEl = document.getElementById('clusterRadiusValue');
    if (!range) return;
    const value = parseInt(range.value, 10);
    if (!isNaN(value)) {
        clusterRadius = value;
        if (valueEl) valueEl.textContent = String(value);
        rebuildClusterGroup();
    }
}

// 촘촘이 보기 토글 (클러스터 반경 5)
function toggleDenseView() {
    // 켤 때 현재 화면 마커 수가 너무 많으면 거부
    if (!isDenseViewActive) {
        const inView = countMarkersInView();
        const maxAllowed = getAdaptiveDenseLimit();
        if (inView > maxAllowed) {
            if (typeof window !== 'undefined' && typeof window.showNotice === 'function') {
                window.showNotice(`현재 화면 약국 ${inView.toLocaleString()}개 > 허용치 ${maxAllowed.toLocaleString()}개. 확대하거나 범위를 좁혀주세요.`);
            } else {
                console.warn('Dense view blocked:', inView, '>', maxAllowed);
            }
            return;
        }
    }
    isDenseViewActive = !isDenseViewActive;
    const btn = document.getElementById('denseViewBtn');
    if (btn) {
        if (isDenseViewActive) btn.classList.add('active');
        else btn.classList.remove('active');
    }
    // 촘촘이: 클러스터 완전 비활성화(0), 해제 시 기본 50
    clusterRadius = isDenseViewActive ? 0 : 50;
    rebuildClusterGroup();
}

// 현재 화면(bounds) 내 마커 수 계산
function countMarkersInView() {
    if (!map || !allMarkers) return 0;
    const bounds = map.getBounds();
    let count = 0;
    for (const m of allMarkers) {
        const ll = m.getLatLng();
        if (bounds.contains(ll)) count++;
    }
    return count;
}

// 기기 스펙(코어/메모리/DPR) + 최근 렌더링 시간 기반 적응 임계값 계산
function getAdaptiveDenseLimit() {
    const cores = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : 4;
    const mem = (typeof navigator !== 'undefined' && navigator.deviceMemory) ? navigator.deviceMemory : 4; // GB
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? window.devicePixelRatio : 1;
    let limit = 800 + (cores - 4) * 150 + (mem - 4) * 150 - (dpr - 1) * 200;
    // 최근 렌더 평균 시간이 느리면 보수적으로, 빠르면 완화
    if (renderMsAvg > 180) limit *= 0.7;
    else if (renderMsAvg > 120) limit *= 0.85;
    else if (renderMsAvg < 90) limit *= 1.2;
    // 안전 범위 클램프
    limit = Math.max(600, Math.min(3000, limit));
    return Math.round(limit);
}

// 촘촘히 상태에서 임계 초과 시 자동 해제
function enforceDenseGuardIfNeeded() {
    if (!isDenseViewActive) return;
    const inView = countMarkersInView();
    const maxAllowed = getAdaptiveDenseLimit();
    if (inView > maxAllowed) {
        isDenseViewActive = false;
        clusterRadius = 50;
        const btn = document.getElementById('denseViewBtn');
        if (btn) btn.classList.remove('active');
        rebuildClusterGroup();
        if (typeof window !== 'undefined' && typeof window.showNotice === 'function') {
            window.showNotice(`촘촘히 해제됨: 화면 약국 ${inView.toLocaleString()}개 > 허용치 ${maxAllowed.toLocaleString()}개`);
        }
    }
}

// 한약사 필터 토글
function toggleHerbalFilter() {
    isHerbalFilterActive = !isHerbalFilterActive;
    
    const herbalBtn = document.getElementById('herbalFilterBtn');
    
    if (isHerbalFilterActive) {
        herbalBtn.classList.add('active');
    } else {
        herbalBtn.classList.remove('active');
    }
    
    // 검색 실행 (모든 필터 조건 적용, 뷰 유지)
    searchPharmacy(false);
}

// 교차고용(약사+한약사) 필터 토글
function toggleCrossEmployFilter() {
    isCrossEmployFilterActive = !isCrossEmployFilterActive;
    const btn = document.getElementById('crossEmployBtn');
    if (btn) {
        if (isCrossEmployFilterActive) btn.classList.add('active');
        else btn.classList.remove('active');
    }
    // 다른 필터와 조합 가능. 뷰는 유지
    searchPharmacy(false);
}

// 창 크기 변경 시 지도 크기 조정
window.addEventListener('resize', function() {
    if (map) {
        map.invalidateSize();
    }
}); 

// 사용자 위치 표시 및 줌
let userLocationMarker = null;
let userLocationCircle = null;

function locateMe() {
    if (!navigator.geolocation) {
        alert('이 브라우저에서는 위치 기능을 사용할 수 없습니다.');
        return;
    }
    navigator.geolocation.getCurrentPosition(
        function(pos) {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const accuracy = pos.coords.accuracy; // meters

            // 기존 표시 제거
            if (userLocationMarker) {
                map.removeLayer(userLocationMarker);
                userLocationMarker = null;
            }
            if (userLocationCircle) {
                map.removeLayer(userLocationCircle);
                userLocationCircle = null;
            }

            // 마커 아이콘 (파란색 원)
            const meIcon = L.divIcon({
                html: '<div style="width:16px;height:16px;background:#2684FF;border:2px solid white;border-radius:50%;box-shadow:0 0 0 2px rgba(38,132,255,0.4);"></div>',
                iconSize: [16, 16],
                className: ''
            });

            userLocationMarker = L.marker([lat, lng], { icon: meIcon }).addTo(map);
            // 정확도 반경 (최대 500m로 제한)
            const radius = Math.min(accuracy || 300, 500);
            userLocationCircle = L.circle([lat, lng], { radius, color: '#2684FF', fillColor: '#2684FF', fillOpacity: 0.1 }).addTo(map);

            // 뷰 맞추기
            const bounds = L.latLngBounds([
                [lat + 0.001, lng + 0.001],
                [lat - 0.001, lng - 0.001]
            ]);
            map.fitBounds(userLocationCircle.getBounds().pad(0.5));
        },
        function(err) {
            console.error('Geolocation error', err);
            alert('위치 정보를 가져오지 못했습니다. 브라우저 권한을 확인해주세요.');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
}
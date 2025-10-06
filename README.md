# 🏥 전국 약국 찾기 서비스

![Pharmacy Finder](https://img.shields.io/badge/Version-1.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black)

전국 25,000개 이상의 약국 위치와 한약사 정보를 제공하는 인터랙티브 지도 서비스입니다.

## 🌟 주요 기능

### 🗺️ 인터랙티브 지도
- **실시간 지도**: Leaflet.js 기반의 고성능 지도
- **마커 클러스터링**: 25,000개+ 약국을 효율적으로 표시
- **줌 및 패닝**: 자유로운 지도 탐색

### 🔍 스마트 검색
- **실시간 검색**: 약국명, 주소, 지역으로 즉시 검색
- **자동 필터링**: 입력과 동시에 결과 업데이트
- **초기화 기능**: 원클릭으로 전체 보기 복원

### 🍃 한약사 필터링
- **특별 표시**: 한약사가 있는 834개 약국 별도 표시
- **시각적 구분**: 일반 약국(💊) vs 한약사 약국(🍃)
- **상세 정보**: 각 약국의 한약사 수 정보 제공

### 📋 약국 목록
- **사이드바 목록**: 검색/필터 결과를 목록으로 표시
- **원클릭 이동**: 목록 클릭으로 지도 이동
- **상세 정보**: 이름, 주소, 전화번호 표시

### 💬 상세 팝업
- **마커 클릭**: 약국 정보 팝업 표시
- **완전한 정보**: 주소, 전화번호, 개설일, 지역 정보
- **한약사 정보**: 한약사 유무 및 인원 수

### 📱 반응형 디자인
- **모바일 최적화**: 스마트폰에서 완벽 동작
- **태블릿 지원**: 중간 크기 화면 최적화
- **데스크톱 친화적**: 큰 화면에서 최적 경험

## 🚀 기술 스택

- **Frontend**: HTML5, CSS3, JavaScript (ES6+)
- **지도 라이브러리**: Leaflet.js
- **클러스터링**: Leaflet.markercluster
- **아이콘**: Font Awesome
- **호스팅**: Vercel
- **데이터**: 건강보험심사평가원 공공데이터

## 📊 데이터 정보

### 약국 정보 (25,364개)
- **출처**: 건강보험심사평가원 약국정보서비스
- **포함 정보**: 약국명, 주소, 전화번호, 개설일, 좌표
- **업데이트**: 2025년 6월 기준

### 한약사 정보 (834개 약국)
- **출처**: 건강보험심사평가원 의료기관별 상세정보
- **포함 정보**: 약국별 한약사 수
- **특징**: 한의학 서비스 제공 약국 식별 가능

## 🛠️ 로컬 개발

### 설치 및 실행
```bash
# 저장소 클론
git clone https://github.com/username/pharmacy-finder.git
cd pharmacy-finder

# 로컬 서버 실행
python -m http.server 8000

# 브라우저에서 접속
open http://localhost:8000
```

### 파일 구조
```
pharmacy-finder/
├── index.html              # 메인 HTML 파일
├── pharmacy-map.js          # JavaScript 로직
├── package.json             # 프로젝트 정보
├── vercel.json              # Vercel 배포 설정
├── README.md                # 프로젝트 문서
└── asset/                   # 데이터 파일
    ├── 2.약국정보서비스 2025.6.csv
    ├── 12.의료기관별상세정보서비스_10_기타인력정보 2025.6_약국만.csv
    └── herbal_pharmacies.json
```

## 📈 성능 최적화

- **마커 클러스터링**: 대용량 데이터 효율적 렌더링
- **비동기 로딩**: CSV 데이터 백그라운드 로딩
- **캐싱**: 정적 자산 장기 캐싱 설정
- **압축**: Vercel 자동 압축 적용

## 🔒 보안

- **HTTPS**: 안전한 데이터 전송
- **헤더 보안**: XSS, 클릭재킹 방지
- **Content Security**: 안전한 콘텐츠 정책

## 📱 브라우저 지원

- ✅ Chrome (최신)
- ✅ Firefox (최신)
- ✅ Safari (최신)
- ✅ Edge (최신)
- ✅ 모바일 브라우저

## 📄 라이선스

MIT License - 자유롭게 사용, 수정, 배포 가능

## 🤝 기여하기

1. Fork the Project
2. Create your Feature Branch
3. Commit your Changes
4. Push to the Branch
5. Open a Pull Request

## 📞 연락처

프로젝트 관련 문의사항이 있으시면 이슈를 생성해주세요.

---

⭐ 이 프로젝트가 도움이 되셨다면 Star를 눌러주세요! 
# 📦 NGINX Mirror + K6 스트레스 테스트 프로젝트

## 📋 프로젝트 소개

이 프로젝트는 NGINX를 사용하여 **트래픽 미러링(Traffic Mirroring)** 기능을 구현한 예제입니다. 주요 목적은 다음과 같습니다:

1. 들어오는 모든 HTTP 요청을 **Server A**로 라우팅
2. 동일한 요청을 **Server B**로 복제(mirror)
3. 클라이언트는 **Server A**의 응답만 받음
4. **K6**를 사용한 간단한 부하 테스트 포함

### ✨ 사용 시나리오

- **A/B 테스트**: 두 버전의 API 성능 비교
- **Shadow 테스트**: 실제 트래픽으로 새 서비스 테스트
- **로그/분석**: 실제 요청을 분석 시스템으로 복제
- **장애 감지**: 같은 요청에 대한 두 시스템의 응답 비교

### ❓ 자주 묻는 질문 (FAQ)

### "nginx에서 실시간 트래픽을 복제하려면 어떻게 해야 하나요?"

NGINX에서 실시간 트래픽을 복제하는 기본 방법은 `mirror` 지시어를 사용하는 것입니다. 
```nginx
location /api/ {
    mirror /mirror/;
    proxy_pass http://main-server:3000;
}

location = /mirror/ {
    internal;
    proxy_pass http://mirror-server:3000;
}
```
이 설정으로 `/api/`로 들어오는 모든 요청이 main-server로 전달되면서 동시에 mirror-server로도 복제됩니다. 클라이언트는 main-server의 응답만 받습니다.

### "nginx로 요청을 다른 서버로 복사하는 방법이 있나요?"

네, NGINX의 `mirror` 모듈을 사용하면 요청을 다른 서버로 복사할 수 있습니다:
```nginx
server {
    listen 80;
    
    location / {
        mirror /mirror;
        proxy_pass http://primary-server;
    }
    
    location = /mirror {
        internal;
        proxy_pass http://secondary-server;
        proxy_set_header X-Original-URI $request_uri;
    }
}
```
원본 요청 URI를 추적하고 싶다면 `X-Original-URI` 같은 커스텀 헤더를 통해 전달할 수 있습니다.

### "nginx에서 다크 카나리아 전략을 구현하려면 어떻게 해야 하나요?"

다크 카나리아(Dark Canary) 배포 전략은 실제 트래픽의 복사본을 새 버전으로 보내서 위험 없이 테스트하는 방식입니다:

```nginx
server {
    listen 80;
    
    # 모든 요청은 기존 버전으로 전달
    location / {
        proxy_pass http://stable-version;
        
        # 10%의 트래픽을 새 버전으로 미러링 (다크 카나리아)
        if ($request_id ~ "^.{0}[0-9].*$") {
            mirror /canary;
        }
    }
    
    # 카나리아 내부 라우팅
    location = /canary {
        internal;
        proxy_pass http://new-version;
        proxy_set_header X-Canary-Request "true";
    }
}
```

이렇게 설정하면 클라이언트는 항상 안정 버전에서 응답을 받지만, 약 10%의 요청이 새 버전으로도 동시에 전송되어 모니터링 가능합니다.

### "nginx를 사용한 A/B 테스트 설정 방법은?"

NGINX에서 A/B 테스트를 설정하는 방법은 두 가지가 있습니다:

1. **트래픽 분할**: 일부 사용자는 A 버전, 나머지는 B 버전으로 라우팅
```nginx
split_clients "${remote_addr}${http_user_agent}" $variant {
    50%     "a";
    *       "b";
}

server {
    listen 80;
    
    location / {
        proxy_pass http://version_${variant};
    }
}

upstream version_a {
    server server_a:3000;
}

upstream version_b {
    server server_b:3000;
}
```

2. **미러링 방식**: 모든 사용자는 A 버전 응답을 받고, B 버전으로도 요청 복제
```nginx
server {
    listen 80;
    
    location / {
        mirror /versionB;
        proxy_pass http://version_a;
    }
    
    location = /versionB {
        internal;
        proxy_pass http://version_b;
    }
}
```

두 번째 방식은 실제 A/B 테스트보다는 '섀도우 테스트'에 가깝습니다.

### "nginx에서 트래픽 리플리케이션을 설정하는 방법은?"

트래픽 리플리케이션은 mirror 모듈을 통해 다음과 같이 설정합니다:

```nginx
server {
    listen 80;
    
    # 기본 위치 블록
    location / {
        proxy_pass http://primary_server;
        
        # 모든 요청을 복제
        mirror /replica;
    }
    
    # 복제 요청을 처리하는 내부 위치
    location = /replica {
        internal;
        proxy_pass http://replica_server;
        
        # 복제된 요청임을 알리는 헤더 추가
        proxy_set_header X-Replicated-Request "true";
        
        # 원본 요청 정보 유지
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

복제된 트래픽을 식별하기 위해 `X-Replicated-Request` 같은 커스텀 헤더를 추가할 수 있습니다.

### "nginx로 요청을 복제하여 로깅 서버로 보내는 방법이 있나요?"

NGINX에서 요청을 로깅 서버로 복제하는 설정은 다음과 같습니다:

```nginx
server {
    listen 80;
    
    location / {
        # 원본 요청 처리
        proxy_pass http://application_server;
        
        # 로깅 목적으로 요청 복제
        mirror /logging;
    }
    
    location = /logging {
        internal;
        
        # 로깅 서버로 전달
        proxy_pass http://logging_server;
        
        # 로깅에 필요한 추가 정보 전달
        proxy_set_header X-Request-Time $request_time;
        proxy_set_header X-Original-Method $request_method;
        proxy_set_header X-Original-URI $request_uri;
        proxy_set_header X-Original-Host $host;
        proxy_set_header X-Client-IP $remote_addr;
        
        # 요청 본문 포함
        proxy_pass_request_body on;
    }
}
```

이 구성을 통해 모든 요청의 상세 정보가 로깅 서버로 전송되며, 원본 애플리케이션의 응답 시간에 영향을 주지 않습니다.

---

## 🔍 작동 방식

![NGINX 미러링 다이어그램](https://your-image-url-here.com/nginx-mirror-diagram.png)
(블로그 작성 시 다이어그램 이미지 추가 권장)

1. 클라이언트가 `http://localhost:8080/api/...` 로 요청 전송
2. NGINX가 요청을 수신하고 **두 가지 작업**을 수행:
   - 요청을 **Server A**로 전달 (프록시)
   - 동일한 요청을 **Server B**로 미러링 (내부적으로 복제)
3. **Server A**는 응답 생성 → 클라이언트에게 전달
4. **Server B**는 요청 처리 후 응답 생성 → 응답은 버려짐(discard)
5. 클라이언트는 오직 **Server A**의 응답만 수신

---

## 📁 디렉토리 구조

```
nginx-mirror-test/
├── docker-compose.yml         # Docker 컨테이너 구성
├── nginx/
│   └── default.conf           # NGINX 설정 (미러링 설정 포함)
├── server-a/
│   ├── app.js                 # Express 서버 (메인)
│   ├── package.json           # 의존성 정의
│   └── Dockerfile             # 도커 이미지 빌드 설정
├── server-b/
│   ├── app.js                 # Express 서버 (미러)
│   ├── package.json           # 의존성 정의
│   └── Dockerfile             # 도커 이미지 빌드 설정
├── k6/
│   └── test-script.js         # 부하 테스트 스크립트
└── README.md                  # 이 문서
```

---

## ⚙️ 서비스 구성 및 포트

| 서비스 이름 | 설명                    | 내부 포트 | 로컬 포트 | 접근 URL                |
|-------------|-------------------------|-----------|-----------|--------------------------|
| NGINX       | 요청 수신 및 미러 처리 | 80        | **8080**  | http://localhost:8080/api/... |
| Server A    | 메인 처리 서버         | 3000      | **3001**  | http://localhost:3001/... (직접 접근용) |
| Server B    | 미러링용 서버          | 3000      | **3002**  | http://localhost:3002/... (직접 접근용) |
| K6          | 스트레스 테스트 도구   | -         | -         | - |

---

## 🚀 실행 방법

### 준비 사항
- [Docker](https://www.docker.com/get-started) 설치
- [Docker Compose](https://docs.docker.com/compose/install/) 설치

### 단계별 실행 가이드

1. **프로젝트 클론 또는 파일 생성**

```bash
git clone https://github.com/your-username/nginx-mirror-test.git
# 또는
mkdir nginx-mirror-test && cd nginx-mirror-test
```

2. **파일 구조 생성**  
   위 디렉토리 구조에 맞게 파일들을 생성합니다. 각 파일의 내용은 아래에서 확인할 수 있습니다.

3. **Docker Compose 실행**

```bash
docker-compose build --no-cache  # 처음 실행 시 --no-cache 옵션 추천
docker-compose up                # 서비스 실행
```

4. **테스트 요청 보내기**

```bash
curl http://localhost:8080/api/test
```

5. **결과 확인**
   - 터미널에서 `docker-compose up` 출력을 보면 두 서버 모두 요청을 받았는지 확인
   - **Server A** 로그: `Server A received: GET /api/test`
   - **Server B** 로그: `Server B (mirror) received: GET /api/test`
   - 클라이언트는 `Handled by Server A` 응답만 받음

6. **스트레스 테스트 실행 (자동 실행됨)**  
   `docker-compose up` 실행 시 k6 컨테이너가 자동으로 10초간 부하 테스트를 실행합니다.

7. **종료**

```bash
docker-compose down  # 서비스 중지 및 컨테이너 제거
```

---

## 📊 로그 확인 방법

Docker에서 컨테이너 로그를 확인하는 방법은 여러 가지가 있습니다. 로그를 통해 미러링 작동 및 요청/응답을 모니터링할 수 있습니다.

### 1. Docker Desktop UI에서 로그 보기

1. Docker Desktop 애플리케이션 실행
2. **Containers** 탭으로 이동
3. 컨테이너 이름 옆의 로그 아이콘(📋) 클릭
4. 로그 창에서 실시간 로그 확인 가능

### 2. 터미널에서 로그 보기 (권장)

```bash
# 모든 컨테이너의 로그 확인
docker-compose logs

# 특정 서비스의 로그만 확인
docker-compose logs nginx
docker-compose logs server_a
docker-compose logs server_b

# 실시간 로그 확인 (follow 옵션)
docker-compose logs -f

# 특정 서비스의 실시간 로그 확인
docker-compose logs -f server_a
```

### 3. 로그를 파일로 저장

```bash
# 모든 로그를 파일로 저장
docker-compose logs > logs.txt

# 특정 서비스 로그만 파일로 저장
docker-compose logs server_a > server_a_logs.txt
```

### 4. docker-compose.yml에 로깅 설정 추가

로그 관리를 위해 docker-compose.yml 파일의 각 서비스에 로깅 설정을 추가할 수 있습니다:

```yaml
services:
  server_a:
    # 기존 설정...
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

이 설정은 로그 파일 크기를 제한하고 로테이션을 관리합니다.

### 5. 로그 확인 도구 활용

- **Portainer**: Docker 관리 UI로, 컨테이너 로그를 보기 쉽게 해줍니다.
- **Dozzle**: 웹 기반의 가벼운 Docker 로그 뷰어 (https://github.com/amir20/dozzle)

```bash
# Dozzle 실행 예시
docker run --name dozzle -d --volume=/var/run/docker.sock:/var/run/docker.sock -p 8888:8080 amir20/dozzle
```

실행 후 `http://localhost:8888`으로 접속하여 모든 컨테이너의 로그를 확인할 수 있습니다.

---

## 📜 주요 파일 설명

### 📄 docker-compose.yml

```yaml
version: '3.8'
services:
  nginx:
    image: nginx:latest
    ports:
      - "8080:80"
    volumes:
      - ./nginx/default.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - server_a
      - server_b
  server_a:
    build: ./server-a
    ports:
      - "3001:3000"
    volumes:
      - ./server-a:/usr/src/app
      - /usr/src/app/node_modules  # node_modules를 보존하기 위한 익명 볼륨
    working_dir: /usr/src/app
    command: node app.js
  server_b:
    build: ./server-b
    ports:
      - "3002:3000"
    volumes:
      - ./server-b:/usr/src/app
      - /usr/src/app/node_modules  # node_modules를 보존하기 위한 익명 볼륨
    working_dir: /usr/src/app
    command: node app.js
  k6:
    image: grafana/k6
    volumes:
      - ./k6:/scripts
    entrypoint: ["k6", "run", "/scripts/test-script.js"]
    depends_on:
      - nginx
```

#### 볼륨 설정 중요 포인트
- `/usr/src/app/node_modules` 익명 볼륨은 컨테이너의 node_modules 디렉토리를 보존합니다
- 로컬 디렉토리 마운트가 컨테이너의 node_modules를 가리지 않도록 합니다
- 이렇게 하면 컨테이너 내에서 설치된 npm 모듈에 정상적으로 접근할 수 있습니다

### 📄 nginx/default.conf

```nginx
server {
    listen 80;

    location /api/ {
        mirror /mirror/;
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

#### NGINX 설정 설명
- `mirror /mirror/;` - 원본 요청을 `/mirror/` 위치로 복제
- `internal;` - 외부에서 직접 접근할 수 없는 내부 위치로 지정
- `proxy_pass http://server_X:3000;` - Docker의 서비스명을 그대로 hostname으로 사용

### 📄 server-a/app.js

```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.all('*', (req, res) => {
  console.log('Server A received:', req.method, req.url);
  res.send('Handled by Server A');
});

app.listen(3000, () => console.log('Server A running on port 3000'));
```

### 📄 server-b/app.js

```javascript
const express = require('express');
const app = express();
app.use(express.json());

app.all('*', (req, res) => {
  console.log('Server B (mirror) received:', req.method, req.url);
  res.sendStatus(204);  // No Content 응답 (미러링이므로 응답 내용은 중요하지 않음)
});

app.listen(3000, () => console.log('Server B running on port 3000'));
```

### 📄 server-a/Dockerfile & server-b/Dockerfile

```dockerfile
FROM node:18
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["node", "app.js"]
```

#### Dockerfile 설명
- `COPY package*.json ./` - 의존성 정의 파일만 먼저 복사 (캐싱 최적화)
- `RUN npm install` - 의존성 설치
- `COPY . .` - 나머지 소스 코드 복사

### 📄 server-a/package.json & server-b/package.json

```json
{
  "name": "server-a",
  "version": "1.0.0",
  "main": "app.js",
  "license": "MIT",
  "dependencies": {
    "express": "^4.18.2"
  }
}
```

### 📄 k6/test-script.js

```javascript
import http from 'k6/http';
import { sleep } from 'k6';

export let options = {
  vus: 10,           // 가상 사용자 수 (동시 연결)
  duration: '10s',   // 테스트 시간
};

export default function () {
  http.get('http://nginx/api/test');
  sleep(1);  // 1초 대기
}
```

---

## 🧪 테스트 방법 및 활용 예시

### 기본 테스트

```bash
# 단일 요청 테스트
curl http://localhost:8080/api/test

# POST 요청 테스트
curl -X POST -H "Content-Type: application/json" \
     -d '{"data":"test"}' \
     http://localhost:8080/api/users
```

### 고급 테스트 시나리오

#### 1. 다양한 API 엔드포인트 테스트
server-a와 server-b의 app.js를 수정하여 여러 엔드포인트를 추가할 수 있습니다:

```javascript
// express 라우터 설정 예시
app.get('/api/users', (req, res) => {
  console.log('GET /api/users received');
  res.json({ users: ['user1', 'user2'] });
});

app.post('/api/users', (req, res) => {
  console.log('POST /api/users received', req.body);
  res.status(201).json({ success: true, data: req.body });
});
```

#### 2. 성능 차이 모니터링
서버 A와 서버 B에 타이밍 로그를 추가하여 성능 차이 확인:

```javascript
app.all('*', (req, res) => {
  const start = Date.now();
  // 복잡한 로직 또는 DB 연산 처리
  const elapsed = Date.now() - start;
  console.log(`Request processed in ${elapsed}ms`);
  res.send('...');
});
```

#### 3. 맞춤형 K6 테스트 작성
k6/test-script.js를 수정하여 더 복잡한 테스트 시나리오 작성:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
  stages: [
    { duration: '20s', target: 10 },  // 10명의 사용자까지 20초에 걸쳐 증가
    { duration: '30s', target: 10 },  // 30초 동안 10명 유지
    { duration: '10s', target: 0 },   // 10초에 걸쳐 0명으로 감소
  ],
};

export default function () {
  const res = http.get('http://nginx/api/test');
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(1);
}
```

### 2. 고급 NGINX 설정
- SSL/TLS 적용
- 요청 내용 기반으로 미러링 조건 설정 (특정 헤더, 경로만 미러링)
- 로드 밸런싱 추가

```nginx
# 조건부 미러링 예시
location /api/ {
    if ($http_x_mirror = "true") {
        mirror /mirror/;
    }
    proxy_pass http://server_a:3000;
}
```

#### 다양한 서브 경로 미러링 예제

NGINX는 유연한 미러링 설정을 지원합니다. 아래는 다양한 조건과 경로에 따라 미러링을 수행하는 예제입니다.

##### 1. 특정 서브 경로만 미러링

```nginx
server {
    listen 80;

    # /api/users/ 경로만 미러링
    location /api/users/ {
        mirror /mirror_users/;
        proxy_pass http://server_a:3000;
    }

    # /api/products/ 경로만 미러링
    location /api/products/ {
        mirror /mirror_products/;
        proxy_pass http://server_a:3000;
    }

    # 일반 API 경로 (미러링 없음)
    location /api/ {
        proxy_pass http://server_a:3000;
    }

    # users 미러링을 위한 내부 위치
    location = /mirror_users/ {
        internal;
        proxy_pass http://server_b:3000;
    }

    # products 미러링을 위한 내부 위치
    location = /mirror_products/ {
        internal;
        proxy_pass http://server_c:3000;  # 다른 서버로 미러링
    }
}
```

##### 2. HTTP 메서드에 따른 미러링

```nginx
server {
    listen 80;

    location /api/ {
        # POST 요청만 미러링
        if ($request_method = "POST") {
            mirror /mirror/;
        }
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

##### 3. 쿼리 파라미터에 따른 미러링

```nginx
server {
    listen 80;

    location /api/ {
        # debug=true 쿼리 파라미터가 있을 때만 미러링
        if ($arg_debug = "true") {
            mirror /mirror/;
        }
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

##### 4. 특정 헤더 값이나 쿠키에 따른 미러링

```nginx
server {
    listen 80;

    location /api/ {
        # 특정 사용자 에이전트만 미러링
        if ($http_user_agent ~* "PostmanRuntime") {
            mirror /mirror/;
        }
        # 특정 세션 ID를 가진 요청만 미러링
        if ($cookie_sessionid = "test-session") {
            mirror /mirror/;
        }
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

##### 5. 요청 본문 변경하여 미러링 (주의: 실험적 기능)

```nginx
server {
    listen 80;

    location /api/ {
        mirror /mirror/;
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        
        # 미러링된 요청에 추가 헤더 전달
        proxy_set_header X-Mirrored-Request "true";
        
        # 요청 본문을 그대로 전달
        proxy_pass_request_body on;
        
        # 원본 HTTP 메서드 유지
        proxy_method $request_method;
        
        proxy_pass http://server_b:3000;
    }
}
```

##### 6. 트래픽 샘플링 (일부 요청만 미러링)

```nginx
server {
    listen 80;
    
    # 변수 설정
    set $do_mirror 0;
    
    # 약 10%의 요청만 미러링 (임의 샘플링)
    if ($request_id ~ "^.{0}[0-9a].*$") {
        set $do_mirror 1;
    }
    
    location /api/ {
        if ($do_mirror = 1) {
            mirror /mirror/;
        }
        proxy_pass http://server_a:3000;
    }
    
    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

이러한 고급 설정을 통해 미러링을 특정 환경이나 요구사항에 맞게 세밀하게 조정할 수 있습니다. 프로덕션 환경에서는 성능 영향을 고려하여 적절한 미러링 전략을 선택하세요.

### 3. 모니터링 추가

---

## 🔧 자주 발생하는 문제와 해결 방법

### 1. Cannot find module 'express' 에러

**증상**: 서버 A 또는 서버 B가 시작되지 않고 아래 오류 출력
```
Error: Cannot find module 'express'
```

**원인**: 컨테이너의 node_modules가 로컬 볼륨 마운트에 의해 가려지는 문제

**해결**:
- docker-compose.yml에 익명 볼륨 추가 (이미 추가됨)
```yaml
volumes:
  - ./server-a:/usr/src/app
  - /usr/src/app/node_modules  # 이 부분이 중요
```
- 또는 깨끗한 빌드 시도:
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up
```

### 2. NGINX 연결 오류

**증상**: "host not found in upstream" 오류

**원인**: server_a, server_b 서비스가 실행되지 않았거나 NGINX에서 접근할 수 없음

**해결**:
- 컨테이너의 상태 확인: `docker-compose ps`
- NGINX 서비스가 서버 서비스 다음에 시작되도록 `depends_on` 설정 확인
- Docker 네트워크가 올바르게 구성되었는지 확인: `docker network ls`

### 3. 로컬 접속 실패

**증상**: "Connection refused" 오류가 발생하며 localhost:8080에 접속 불가

**원인**: 
- Docker Desktop이 정상 실행 중이 아님
- 포트 충돌

**해결**:
- Docker Desktop 상태 확인 및 재시작
- 포트가 이미 사용 중인지 확인: `lsof -i :8080`
- 필요시 docker-compose.yml에서 포트 변경

---

## 📚 확장 및 최적화 방법

### 1. 실제 애플리케이션 통합
- 미러링 로직을 실제 API 또는 마이크로서비스에 적용할 수 있습니다
- DB 연동, 인증 처리 등의 기능 추가 가능

### 2. 고급 NGINX 설정
- SSL/TLS 적용
- 요청 내용 기반으로 미러링 조건 설정 (특정 헤더, 경로만 미러링)
- 로드 밸런싱 추가

```nginx
# 조건부 미러링 예시
location /api/ {
    if ($http_x_mirror = "true") {
        mirror /mirror/;
    }
    proxy_pass http://server_a:3000;
}
```

#### 다양한 서브 경로 미러링 예제

NGINX는 유연한 미러링 설정을 지원합니다. 아래는 다양한 조건과 경로에 따라 미러링을 수행하는 예제입니다.

##### 1. 특정 서브 경로만 미러링

```nginx
server {
    listen 80;

    # /api/users/ 경로만 미러링
    location /api/users/ {
        mirror /mirror_users/;
        proxy_pass http://server_a:3000;
    }

    # /api/products/ 경로만 미러링
    location /api/products/ {
        mirror /mirror_products/;
        proxy_pass http://server_a:3000;
    }

    # 일반 API 경로 (미러링 없음)
    location /api/ {
        proxy_pass http://server_a:3000;
    }

    # users 미러링을 위한 내부 위치
    location = /mirror_users/ {
        internal;
        proxy_pass http://server_b:3000;
    }

    # products 미러링을 위한 내부 위치
    location = /mirror_products/ {
        internal;
        proxy_pass http://server_c:3000;  # 다른 서버로 미러링
    }
}
```

##### 2. HTTP 메서드에 따른 미러링

```nginx
server {
    listen 80;

    location /api/ {
        # POST 요청만 미러링
        if ($request_method = "POST") {
            mirror /mirror/;
        }
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

##### 3. 쿼리 파라미터에 따른 미러링

```nginx
server {
    listen 80;

    location /api/ {
        # debug=true 쿼리 파라미터가 있을 때만 미러링
        if ($arg_debug = "true") {
            mirror /mirror/;
        }
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

##### 4. 특정 헤더 값이나 쿠키에 따른 미러링

```nginx
server {
    listen 80;

    location /api/ {
        # 특정 사용자 에이전트만 미러링
        if ($http_user_agent ~* "PostmanRuntime") {
            mirror /mirror/;
        }
        # 특정 세션 ID를 가진 요청만 미러링
        if ($cookie_sessionid = "test-session") {
            mirror /mirror/;
        }
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

##### 5. 요청 본문 변경하여 미러링 (주의: 실험적 기능)

```nginx
server {
    listen 80;

    location /api/ {
        mirror /mirror/;
        proxy_pass http://server_a:3000;
    }

    location = /mirror/ {
        internal;
        
        # 미러링된 요청에 추가 헤더 전달
        proxy_set_header X-Mirrored-Request "true";
        
        # 요청 본문을 그대로 전달
        proxy_pass_request_body on;
        
        # 원본 HTTP 메서드 유지
        proxy_method $request_method;
        
        proxy_pass http://server_b:3000;
    }
}
```

##### 6. 트래픽 샘플링 (일부 요청만 미러링)

```nginx
server {
    listen 80;
    
    # 변수 설정
    set $do_mirror 0;
    
    # 약 10%의 요청만 미러링 (임의 샘플링)
    if ($request_id ~ "^.{0}[0-9a].*$") {
        set $do_mirror 1;
    }
    
    location /api/ {
        if ($do_mirror = 1) {
            mirror /mirror/;
        }
        proxy_pass http://server_a:3000;
    }
    
    location = /mirror/ {
        internal;
        proxy_pass http://server_b:3000;
    }
}
```

이러한 고급 설정을 통해 미러링을 특정 환경이나 요구사항에 맞게 세밀하게 조정할 수 있습니다. 프로덕션 환경에서는 성능 영향을 고려하여 적절한 미러링 전략을 선택하세요.

### 3. 모니터링 추가

---

## 📌 참고사항

- Docker 네트워크 내에서 서비스 간 통신 시 서비스명을 호스트명으로 사용
- `host.docker.internal`은 Mac/Windows 환경에서 호스트 머신에 접근하는 방법
- Docker 볼륨 마운트 시 주의사항:
  - 로컬 폴더를 컨테이너에 마운트하면 컨테이너 내 기존 파일이 가려질 수 있음
  - node_modules 같은 중요 디렉토리는 익명 볼륨으로 보존해야 함

---

## 📬 문의 및 추가 정보

- 더 복잡한 테스트 시나리오 구성이 필요하면 k6 스크립트를 확장하세요
- JWT 인증, 헤더 기반 라우팅, 파일 업로드 등의 고급 시나리오 테스트 가능
- 이슈나 질문은 GitHub Issues 또는 블로그 댓글로 문의해주세요

---

## 🔗 유용한 링크

- [NGINX 미러링 공식 문서](https://nginx.org/en/docs/http/ngx_http_mirror_module.html)
- [Docker Compose 문서](https://docs.docker.com/compose/)
- [K6 부하 테스트 가이드](https://k6.io/docs/)
- [Express.js 문서](https://expressjs.com/)

---

**블로그 작성자 팁:** README 내용을 블로그에 옮길 때, 다이어그램과 실행 스크린샷을 추가하면 내용을 더 명확하게 전달할 수 있습니다. 필요한 부분에 주석을 달아 초보자도 이해하기 쉽게 만드세요.

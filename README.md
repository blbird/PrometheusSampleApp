# 모니터링을 위한 Prometheus와 Grafana 맛보기
## 서론
최근 많은 분야에서 MSA도입을 고려하고 있습니다. MSA는 많은 장점을 가지고 있지만, 서비스의 개수가 증가할수록 운영의 복잡도가 증가한다는 단점도 있습니다. 이러한 운영 복잡도 증가를 해결하기 위해 서비스들에 대한 모니터링 기능이 중요시 되고 있습니다. 이러한 모니터링 도구로 newrelic(https://newrelic.com), sysdig(https://sysdig.com) 등의 다양한 유료 툴들과 Prometheus(https://prometheus.io/), Statsd(https://github.com/statsd/statsd) 등 여러 무료 툴들이 존재하고 있습니다. 본 글에서는 이 중 오픈 소스 툴인 Prometheus를 활용한 모니터링에 대해 알아 보도록 하겠습니다.


## 목표
Prometheus에 사용자의 모니터링 데이터를 보내기 위한 어플리케이션을 제작하고, Prometheus Server에 적재된 모니터링 데이터를 Grafana 대시보드에서 그래프로 보여주는 것을 목표로 합니다.


## 구성
본 문서에서는 Prometheus와 Grafana에 대해 간단히 알아보고, 다음편에서는 Prometheus에 모니터링 데이터를 보내기 위한 어플리케이션 제작하고, 로컬 docker 환경에서 Prometheus와 Grafana를 실행하여 모니터링 기능에 대해 확인해 보도록 하겠습니다.

- Prometheus와 Grafana
- Prometheus 모니터링 어플리케이션 개발과 로컬 docker를 활용한 테스트


## Prometheus와 Grafana
### Prometheus
여기서는 Prometheus의 동작 방식을 이해하기 위해 아키텍쳐 및 구성 컴포넌트를 살펴보고, 사용 방법을 알기 위한 메트릭과 PromQL에 대해서 알아보겠습니다.

#### Prometheus 동작 및 아키텍쳐
일반적인 모니터링 툴들은 REST API등을 통해 모니터링 데이터를 어플리케이션에서 직접 보내는 방법을 많이 사용합니다. 하지만, Prometheus는 다른 모니터링 툴과는 다르게 Pull 방식을 사용하여 어플리케이션으로 부터 모니터링 데이터를 가져옵니다. 즉, Prometheus는 등록된 모니터링 대상으로 API를 호출하여 모니터링 데이터를 수집합니다. 아래의 Prometheus의 아키텍처 그림을 보시면, Prometheus Server가 각종 Exporter나 Pushgateway로 모니터링 데이터를 가져오기 위해 API를 호출하는 모습을 화살표의 방향을 통해 확인하실 수 있습니다.

![Prometheus_Architecture](/images/Prometheus_Architecture.png)

아키텍처 그림에서 보여지는 Prometheus의 주요 컴포넌트는 아래와 같은 역할을 합니다.

- Prometheus Server: 모니터링 데이터를 수집하고 저장합니다.
- Pushgateway: 배치나 스케쥴링으로 동작하는 어플리케이션의 경우 항상 실행되는 것이 아니기 때문에 해당 어플리케이션의 API를 호출할 수 없습니다. 이런 경우 해당 어플리케이션은 어플리케이션이 동작하는 동안 모니터링 데이터를 Pushgateway로 보내고, 추후 Prometheus server가 이 Pushgateway의 데이터를 수집하는 방식을 사용할 수 있습니다.
- Prometheus Web UI, Grafana : Prometheus에 저장된 데이터를 조회하거나 시각화하는 기능을 제공합니다.
- Alert Manager: 특정 룰을 이용한 알람 설정을 통해 알람 발생될 조건이 되면 설정된 Email이나 PagerDuty를 통해 알람의 내용을 전달할 수 있습니다.
- Exporter: 모니터링 데이터를 수집하고 Prometheus Server에서 수집 요청이 오면 모니터링 데이터를 넘겨줍니다. 이미 여러 제품 및 툴들을 위한 Exporter들이 만들어져 있으니 사용하시는 시스템에 따라 이미 만들어진 Exporter를 활용하실 수 있습니다. (https://prometheus.io/docs/instrumenting/exporters/)

#### Prometheus 메트릭
- Prometheus의 메트릭은 기본적으로 메트릭 구분을 위한 name과 메트릭을 설명하기 위한 help로 구성됩니다. 메트릭 name은 아스키문자, 숫자, 언더바(_), 콜론(:)만 지원합니다. 따라서 메트릭 name은 반드시 이 정규식을 “[a-zA-Z_:][a-zA-Z0-9_:]*” 만족해야 합니다. 그리고 메트릭을 좀 더 자세하게 구분하기 위해 레이블이라는 값을 이용할 수 있습니다. 이런 레이블은 아스키 문자, 숫자, 언더바만 지원합니다.
대부분의 Prometheus 어플리케이션 라이브러리는 아래와 같은 네가지의 주요 메트릭 타입을 제공하고 있습니다. 따라서 어플리케이션을 제작하실 때 필요한 메트릭에 맞는 타입을 선택하셔서 사용하시면 됩니다.

- Counter: 증가만 가능한 메트릭이며 프로그램 재시작시 초기화 됩니다. 예를들어, 감소하지 않고 증가만 하는 값 들인 리퀘스트 카운트, 전송량 같은 값들을 표시 하는데 사용될 수 있습니다.
- Guage: 증가와 감소가 가능한 메트릭이며 현재값을 기준으로 증가나 감소를 시키거나 특정 값을 설정할수 있습니다. 온도, 상태, 현재 측정값 등을 표현하는데 사용될 수 있습니다.
- Histogram: 관측값을 저장하기 위한 메트릭이며, 관측값을 저장하면 관측값의 횟수가 [metric이름]_count 에 나타나며 관측값의 합이 [metric이름]_sum에 나타나게 됩니다. 또한 특정 값의 범위를 가지는 bucket을 통해 값의 분포를 확인할수 있습니다. 전송 속도, 에러 분포 등을 표현하기 좋습니다.
- Summary : histogram과 같이 관측값을 저장하는 메트릭이며, φ-quantile이 자동적으로 계산됩니다. φ는 0과 1 사이의 값을 가지며, φ-quantile은 전체 관측값의 수가 N 이라고 했을때 φx N 번째 값을 의미합니다. 예를 들어 전체 관측값이 100개이고, φ가 0.95이면 전체 100개의 관측값 중 95번째에 해당되는 값을 의미합니다.

#### PromQL
기본적인 쿼리는 메트릭 name을 명시하여 해당 값을 쿼리 합니다.
레이블에 대한 쿼리는 {}를 이용하여 레이블에 대한 조건을 명시합니다. 예를 들어 http_requests_total{label=”test”}는 http_requests_total 메트릭에서 label이 test인 것을 나타냅니다. 레이블에 대한 조건은 =(정확히 일치되는 레이블), != (일치하지 않는 레이블), =~(정규식에 맞는 레이블), !~(정규식에 맞지 않는 레이블) 의 네가지 타입을 지원합니다. 보시는 바와 같이 사용되는 조건에 따라 일반적인 스트링 및 정규식을 이용할 수 있습니다.
[]를 사용해서 특정 기간동안의 값들을 나타낼수 있습니다. http_requests_total{label=”test”}[5m]은 test 레이블을 가진 http_requests_total 메트릭의 5분 동안의 값을 나타냅니다. s(seconds), m(minutes), h(hours), d(days), w(weeks) ,y(years) 의 문자를 지원합니다. 일반적으로 sum(), rate()등의 함수와 같이 사용됩니다.
사칙연산, 나머지, 지수등의 기본 숫자 연산자를 지원합니다. 또한 등호, 부등호 등의 비교 연산자와 and, or 등의 바이너리 연산자도 지원하고 있습니다. 좀더 자세한 내용은 https://prometheus.io/docs/prometheus/latest/querying/operators/를 확인하시기 바랍니다.
절대값을 위한 abs(), 선택된 값들의 합을 구하는 sum(), 특정 기간동안의 변화량을 기준으로 1초 동안의 변화량을 계산하는 rate()함수 등 다양한 종류의 함수를 지원합니다. 더 많은 함수에 대한 내용은 https://prometheus.io/docs/prometheus/latest/querying/functions/에서 보실수 있습니다.

### Grafana
Grafana는 수집된 모니터링 데이터를 다양한 차트와 그래프를 이용하여 시각화하여 보여주는 툴입니다. 각각의 모니터링 시스템에 맞도록 모니터링 데이터의 흐름이나 현재 상태를 보기 위한 대시보드를 생성할 수 있습니다.
https://play.grafana.org 에서 다양한 Grafana 대시보드 샘플을 보실 수 있으며, https://grafana.com/grafana/dashboards 에서 미리 만들어진 대시보드를 다운받아 import할 수 있습니다.


## 모니터링 어플리케이션
어플리케이션은 prom-client 패키지(https://github.com/siimon/prom-client)를 사용합니다. prom-client는 prometheus의 네가지 주요 메트릭을 모두 지원합니다. 이 외에도 CPU와 메모리등의 기본 시스템 메트릭, 멀티플 레지스트리, 푸쉬 게이트웨이 지원등의 다양한 기능들이 있으니 prom-clinet 패키지 사이트에서 확인해 보시기 바랍니다.

### 소스 내려 받기
모니터링 어플리케이션 소스는 https://github.com/blbird/PrometheusSampleApp에 있습니다. 해당 소스를 clone 합니다.
```
git clone https://github.com/blbird/PrometheusSampleApp.git
```
### 소스 설명 (PrometheusSampleApp 디렉토리에 있습니다.)
app.js 파일을 보시면 아래와 같이 5가지 메트릭을 정의하여 사용합니다.

```
const counter = new promClient.Counter({
  name: 'prom_sample_counter',
  help: 'prom_sample_counter_help',
});

const gauge = new promClient.Gauge({
  name: 'prom_sample_gauge',
  help: 'prom_sample_gauge_help',
});

const labeledGauge = new promClient.Gauge({
  name: 'prom_sample_labeled_gauge',
  help: 'prom_sample_labeled_gauge_help',
  labelNames: ['id'],
}); 

const histogram = new promClient.Histogram({
  name: 'prom_sample_histogram',
  help: 'prom_sample_histogram_help',
  labelNames: ['status_code'],
  buckets: [20, 40, 60, 80, 100],
});

const summary = new promClient.Summary({
  name: 'prom_sample_summary',
  help: 'prom_sample_summary_help',
  labelNames: ['status_code'],
});
```

각 metric은 아래와 같이 15초 간격으로 값을 변경합니다.

- prom_sample_counter는 값을 1 증가시키고, prom_sample_gauge는 값이 0부터 10까지 증가했다가 다시 0까지 감소합니다.
- prom_sample_labeled_gauge는 두개의 “2”와 “3”의 두개의 label을 가지고 있으면 각각 prom_sample_gauge값의 2배, 3배의 값으로 설정이 됩니다.
- prom_sample_histogram과 prom_sample_summary는 http 리퀘스트의 상태 결과와 걸린 시간을 램덤하게 설정하였습니다.

```
setInterval(() => {
  // increase counter value
  counter.inc();

  // increase adn decrease gauge value
  if (interval === 1) {
    gauge.inc();
  }
  else {
    gauge.dec();
  }

  cnt += interval;
  if (cnt >= 10) {
    interval = -1;
  }
  else if (cnt <= 0) {
    interval = 1;
  }

  // set labeled gauage value
  labeledGauge.labels('2').set(cnt*2);
  labeledGauge.set({id: '3'}, cnt*3);

  // set histogram value
  const status = Math.floor(Math.random() * statusCodes.length);
  const duration = Math.floor(Math.random() * 100);

  histogram.labels(statusCodes[status]).observe(duration);
  summary.labels(statusCodes[status]).observe(duration);
}, 10000);
```

### 어플리케이션 실행
```
npm install
npm start
```

### 어플리케이션 실행 확인
브라우저에서 http://localhost:9100/metrics 를 입력하시면 Prometheus 포맷의 메트릭 값들을 확인하실수 있습니다.


## Prometheus 실행
### Prometheus 설정 파일
받으신 소스에 prometheus.yml 파일이 있습니다. 이 파일은 Prometheus가 실행되기 위한 설정 파일 입니다. 전편에서 말씀드렸듯이 Prometheus는 pull 방식을 사용합니다. 따라서, 메트릭을 읽어올 서버를 지정해 주어야 합니다. 이런 서버를 지정 및 각 종 설정을 위한 파일이 바로 이 prometheus.yml 파일 입니다. global 부분은 전체에 적용되는 부분으로 현재 데이터를 1분마다 가져오는 것으로 설정했습니다. scrape_configs 부분이 있는데, 이 부분이 데이터를 가져오기 위한 서버를 명시하는 부분입니다. 기본적으로 Prometheus 자체의 메트릭을 읽어 오는 설정이 되어 있습니다. 그리고, prom_sample은 위에서 작성한 어플리케이션을 명시하기 위한 부분으로 읽어오기 위한 interval을 15초로 설정하고 있고 해당 어플리케이션의 주소를 입력하는 부분이 있습니다. 따라서 해당 어플리케이션에서 모니터링 데이터를 읽어오기 위해 부분을 어플리케이션이 실행되고 있는 주소로 변경하셔야 합니다.

```
global:
  scrape_interval: 1m

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
    - targets: ['localhost:9090']
  - job_name: 'prom_sample'
    scrape_interval: 15s
    static_configs:
    - targets: ['target address:9100']
```

### Prometheus docker 컨테이너 생성
아래 명령어를 통해 Prometheus용 docker 컨테이너를 생성합니다. -p 옵션을 통해 Prometheus ui를 보여주기 위한 포트를 localhost의 포트로 매핑해 줍니다. -v 옵션은 위의 설정한 파일을 docker의 prometheus 실행파일에서 읽을수 있도록 docker상의 파일 링크로 마운트 하기 위한 것입니다.
```
docker run -d -p 9090:9090 -v `pwd`/prometheus.yml:/etc/prometheus/prometheus.yml prom/prometheus
```

### Prometheus UI
실행이 완료되면 http://localhost:9090 을 통해 아래와 같은 화면을 보실수 있습니다.
화면에 보이시는 Expression에 메트릭 값이나 Prometheus용 쿼리를 입력하시면 "Console" 탭에서는 현재 값을, " Graph"탭에서는 특정 기간동안의 그래프를 확인하실수 있습니다. 좀 더 다양한 그래프를 보시려면 다음에 설명하는 Grafana를 이용하시면 됩니다.

![Prometheus_UI](/images/Prometheus_UI.png)


## Grafana 실행
## Grafana docker 컨테이너 생성
아래 명령을 통해 Grafana 대시보드의 기본 포트인 3000을 매핑하여 Grafana 컨테이너를 생성합니다. 컨테이너가 생성되면 브라우저에서 http://localhost:3000를 통해 Grafana 화면을 보실수 있습니다.

```
docker run -d -p 3000:3000 grafana/grafana
```

### Grafana 대시보드 가져오기
기본 아이디와 패스워드는 https://hub.docker.com/r/grafana/grafana에서 확인하실수 있습니다. 현재 값은 admin/admin입니다. 아이디와 패스워드를 입력하시면 패스워드 변경창이 실행됩니다. 패스워드를 변경을 하시거나 skip 버튼을 누르시면 아래와 같은 화면을 보실수 있습니다.

![Grafana_Home](/images/Grafana_Home.png)

Grafana 대시보드를 사용하기 위해 우선 데이터 소스를 설정해야 합니다. 화면에 보이시는 "Add data source"를 클릭하고 "Prometheus"를 선택하고 아래 그림과 같이 Access 타입을 "Browser"로 변경하고 "URL"에 "http://localhost:9090" 을 입력합니다. 일반적인 운영 환경에서는 기본적으로 Access를 "Server"로 사용하여 Grafana에서 Prometheus Server로 직접 연결하는 방식을 사용하셔야 합니다. 만약 Access를 "Server" 타입으로 설정하려면, docker의 네트워크 설정을 통해 Prometheus 서버와 Grafana를 같은 네트워크를 사용하도록 설정해 주셔야 합니다. 하지만 본 글에서는 docker 네트워크 설정을 하지 않았기 때문에 타입을 "Browser"로 설정하여 브라우저에서 Prometheus 서버로 접근하는 방식을 사용합니다. 입력이 완료되면 "Save & Test" 버튼을 클릭하여 Grafana에서 Prometheus 서버로의 접근이 가능한지 확인하시면 됩니다.

![Grafana_SetSource](/images/Grafana_SetSource.png)

"Back" 버튼을 누르시면 아래와 같이 데이터 소스가 추가되신걸 확인하실 수 있습니다.

![Grafana_Prometheus_DataSource](/images/Grafana_Prom_Datasource.png)

추가하신 데이터 소소를 이용하여 아래 그림의 + 버튼을 통해 새로운 대시보드를 생성하거나 "import" 메뉴를 통해 기존 대시보드를 가져올수 있습니다. 여기서는 기존의 만들어진 대시보드를 사용하기 위해 "import" 메뉴를 클릭합니다.


![Grafana_ImportDashboard](/images/Grafana_ImportDashboard.png)

"Upload .json File" 버튼을 클릭하신후 github에서 가져온 grafana.json 파일을 선택합니다. 대시보드 이름과 폴더를 선택한 후 "Import" 버튼을 클릭합니다. 아래와 같은 그래프 화면을 보실 수 있습니다. 해당 대시보드는 위의 어플리케이션에서 생성된 메트릭을 다양한 그래프를 사용하여 보여주도록 하였습니다.

![Grafana_Dashboard](/images/Grafana_Dashboard.png)

각각의 그래프에서 사용된 쿼리는 해당 그래프의 타이틀을 클릭 하신 후 "Edit" 메뉴를 선택하시면 보실 수 있습니다.

![Grafana_EditGraph](/images/Grafana_EditGraph.png)

이 외에도 Grafana에서는 다양한 쿼리와 그래프 형태를 사용하여 데이터를 보실 수 있습니다. 이전편에 언급해 드렸던 Grafana 샘플(https://play.grafana.org) 페이지를 참고하셔서 여러분만의 다양한 그래프를 만들어 보시기 바랍니다.


## 맺음말
본 글을 통해 Prometheus와 Grafana, 그리고 이를 Prometheus에 Custom 메트릭을 보내는 방법에 대해 설명하였습니다. 하지만, Prometheus 및 Grafana는 여기서 설명하지 않은 많은 기능들이 있습니다. 예를들어, 운영에 중요한 메트릭 값의 이상증세를 파악하여 경고를 보내주는 Alert 기능(https://prometheus.io/docs/alerting/overview/)도 있습니다. 이런 다양한 기능들은 MSA환경에서 서비스의 이상을 좀 더 빠르게 파악하고 수정할 수 있도록 도움을 줄 것입니다.

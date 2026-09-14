// 起動とルーティング（S1/S2）。M0 ではアプリ名を表示するだけ。
import './styles/base.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  const title = document.createElement('h1');
  title.textContent = 'スケール運指ナビ';
  app.append(title);
}

/** 日志里隐藏 AMQP 密码 */
function redactAmqpUrl(url: string): string {
  return url.replace(/\/\/([^:/@]+):([^@]+)@/, '//$1:***@');
}

export { redactAmqpUrl };

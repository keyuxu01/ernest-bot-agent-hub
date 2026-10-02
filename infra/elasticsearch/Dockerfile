# =============================================================================
# Elasticsearch 8.17.0 + IK 中文分词插件（构建进镜像）
#
# 被 docker-compose.yml 的 es 服务引用：
#     es:
#       build: ./infra/elasticsearch
#
# IK 插件版本必须和 ES 版本完全一致（8.17.0），否则启动失败。
# 升级 ES 时，基础镜像与插件 URL 版本号需一起改。
# =============================================================================

FROM docker.elastic.co/elasticsearch/elasticsearch:8.17.0

RUN bin/elasticsearch-plugin install --batch \
    https://get.infini.cloud/elasticsearch/analysis-ik/8.17.0

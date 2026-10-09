# Kubernetes deployment foundation

This is a reviewed scaffold, not a claim that production has been deployed. Replace every image and hostname placeholder with immutable release values, create `kori-runtime-secrets` through a secret manager, and validate the target cluster's ingress and network-policy implementation.

The landing site, field app, API docs, restricted review console, and API are separate workloads. PostgreSQL, object storage, email, OAuth, Tempo, Prometheus, and Grafana are expected as managed or separately operated dependencies. The base deliberately does not place database credentials in Git.

## Release and rollback

Use blue-green releases for the API: deploy a second `slot: green` Deployment with the candidate image, run migrations that are backward compatible with both versions, smoke-test the green pods directly, then change the `api` Service selector from `slot: blue` to `slot: green`. Rollback changes the selector back. Never remove the previous slot until error rate, latency, key authentication, and database checks remain healthy for the observation window.

Web surfaces can use rolling deployments because they do not own durable state. Use immutable image digests everywhere. A failed migration is restored through a forward fix or the documented database recovery procedure, not by blindly rolling application containers backward.

## Apply

```sh
kubectl kustomize deploy/kubernetes/base
kubectl apply --server-side --dry-run=server -k deploy/kubernetes/base
```

CronJobs use unique pod names as idempotency keys, forbid concurrent executions, and retain bounded history. Kubernetes may occasionally run a CronJob more than once, so every job also records its run ID in the database.

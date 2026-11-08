import Button from "@/components/ui/button";
import Page from "@/context/page-context";
import { Copy, CircleXIcon, Eye, EyeOff, Trash } from "lucide-react";
import { Alert, Badge, Card, Input, Table } from "react-daisyui";
import { useKeys, useRemoveKey } from "./hooks";
import CreateKeyDialog from "./components/create-key-dialog";
import { toast } from "sonner";
import { copyToClipboard, dayjs, formatExpiryDate, handleError } from "@/lib/utils";
import { useCallback, useMemo, useState } from "react";
import api from "@/lib/api";
import { Key } from "./types";
import PageLoading from "@/components/ui/page-loading";

type KeySecret = {
  secretAccessKey?: string | null;
};

const EXPIRING_SOON_DAYS = 7;

const isExpired = (key: Key) => {
  if (key.expired != null) {
    return key.expired;
  }
  if (!key.expiration) {
    return false;
  }
  return dayjs(key.expiration).isBefore(dayjs());
};

const isExpiringSoon = (key: Key) => {
  if (isExpired(key) || !key.expiration) {
    return false;
  }
  return dayjs(key.expiration).isBefore(dayjs().add(EXPIRING_SOON_DAYS, "day"));
};

const KeysPage = () => {
  const { data, isLoading, isError, error, refetch } = useKeys();
  const [search, setSearch] = useState("");
  const [secretKeys, setSecretKeys] = useState<Record<string, string>>({});
  const [pendingSecrets, setPendingSecrets] = useState<Record<string, boolean>>(
    {}
  );

  const removeKey = useRemoveKey({
    onSuccess: (_data, id) => {
      setSecretKeys((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      refetch();
      toast.success("Key removed!");
    },
    onError: handleError,
  });

  const fetchSecretKey = useCallback(
    async (id: string) => {
      if (pendingSecrets[id] || secretKeys[id]) {
        return;
      }
      setPendingSecrets((prev) => ({ ...prev, [id]: true }));
      try {
        const result = await api.get<KeySecret>("/v2/GetKeyInfo", {
          params: { id, showSecretKey: "true" },
        });
        const secretAccessKey = result?.secretAccessKey;
        if (!secretAccessKey) {
          throw new Error("Failed to fetch secret key");
        }
        setSecretKeys((prev) => ({ ...prev, [id]: secretAccessKey }));
      } catch (err) {
        handleError(err);
      } finally {
        setPendingSecrets((prev) => ({ ...prev, [id]: false }));
      }
    },
    [pendingSecrets, secretKeys]
  );

  const hideSecretKey = useCallback((id: string) => {
    setSecretKeys((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const onRemove = (id: string) => {
    if (window.confirm("Are you sure you want to remove this key?")) {
      removeKey.mutate(id);
    }
  };

  const items = useMemo(() => {
    if (!search?.length) {
      return data;
    }

    const q = search.toLowerCase();
    return data?.filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q)
    );
  }, [data, search]);

  return (
    <div className="container">
      <Page title="Keys" />

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <Input
          placeholder="Search..."
          aria-label="Search keys"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="flex-1" />
        <CreateKeyDialog />
      </div>

      <Card className="card-body mt-4 md:mt-8 p-4">
        {isError && (
          <Alert status="error" icon={<CircleXIcon />}>
            <span>{error?.message}</span>
            <Button onClick={() => refetch()}>Retry</Button>
          </Alert>
        )}

        <div className="w-full overflow-x-auto">
          <Table zebra>
            <Table.Head>
              <span>#</span>
              <span>Name</span>
              <span>Key ID</span>
              <span>Expiry</span>
              <span>Secret Key</span>
              <span />
            </Table.Head>

            <Table.Body>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>
                    <PageLoading />
                  </td>
                </tr>
              ) : !isError && !items?.length ? (
                <tr>
                  <td colSpan={6} className="text-center py-16">
                    {search ? `No matches for "${search}"` : "No keys yet"}
                  </td>
                </tr>
              ) : null}

              {items?.map((key, idx) => (
                <Table.Row key={key.id}>
                  <span>{idx + 1}</span>
                  <span>{key.name}</span>
                  <div className="flex flex-row items-center">
                    <p className="truncate max-w-20" title={key.id}>
                      {key.id}
                    </p>
                    <Button
                      size="sm"
                      icon={Copy}
                      aria-label="Copy key ID"
                      onClick={() => copyToClipboard(key.id)}
                    />
                  </div>
                  <span>
                    {key.expiration
                      ? formatExpiryDate(key.expiration)
                      : "Never"}
                    {isExpired(key) ? (
                      <Badge color="error" className="ml-2">
                        Expired
                      </Badge>
                    ) : null}
                    {!isExpired(key) && isExpiringSoon(key) ? (
                      <Badge color="warning" className="ml-2">
                        Expiring soon
                      </Badge>
                    ) : null}
                  </span>
                  {!secretKeys[key.id] ? (
                    <Button
                      icon={Eye}
                      size="sm"
                      disabled={!!pendingSecrets[key.id]}
                      onClick={() => fetchSecretKey(key.id)}
                      className="shrink-0 min-w-[80px]"
                    >
                      View
                    </Button>
                  ) : (
                    <div className="flex flex-row items-center">
                      <p
                        className="font-mono max-w-20 truncate"
                        title={secretKeys[key.id]}
                      >
                        {secretKeys[key.id]}
                      </p>
                      <Button
                        size="sm"
                        icon={Copy}
                        aria-label="Copy secret"
                        onClick={() => copyToClipboard(secretKeys[key.id])}
                      />
                      <Button
                        icon={EyeOff}
                        size="sm"
                        onClick={() => hideSecretKey(key.id)}
                        className="shrink-0 min-w-[80px]"
                      >
                        Hide
                      </Button>
                    </div>
                  )}

                  <span>
                    <Button
                      color="ghost"
                      icon={Trash}
                      aria-label={`Remove key ${key.name}`}
                      onClick={() => onRemove(key.id)}
                    />
                  </span>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default KeysPage;

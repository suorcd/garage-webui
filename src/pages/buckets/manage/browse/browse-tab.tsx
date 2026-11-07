import { useSearchParams } from "react-router-dom";
import { Card } from "react-daisyui";

import ObjectList from "./object-list";
import { PropsWithChildren, useEffect, useState } from "react";
import ObjectListNavigator from "./object-list-navigator";
import Actions from "./actions";
import { useBucketContext } from "../context";
import ShareDialog from "./share-dialog";

const BrowseHint = ({ children }: PropsWithChildren) => {
  return (
    <div className="p-4 min-h-[200px] flex flex-col items-center justify-center">
      <p className="text-center max-w-sm">{children}</p>
    </div>
  );
};

const getInitialPrefixes = (searchParams: URLSearchParams) => {
  const prefix = searchParams.get("prefix");
  if (prefix) {
    const paths = prefix.split("/").filter((p) => p);
    return paths.map((_, i) => paths.slice(0, i + 1).join("/") + "/");
  }
  return [];
};

const BrowseTab = () => {
  const { bucket } = useBucketContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [prefixHistory, setPrefixHistory] = useState<string[]>(
    getInitialPrefixes(searchParams)
  );
  const [curPrefix, setCurPrefix] = useState(prefixHistory.length - 1);

  useEffect(() => {
    const prefix = prefixHistory[curPrefix] || "";
    const newParams = new URLSearchParams(searchParams);
    newParams.set("prefix", prefix);
    setSearchParams(newParams);
  }, [curPrefix]);

  const gotoPrefix = (prefix: string) => {
    const history = prefixHistory.slice(0, curPrefix + 1);
    setPrefixHistory([...history, prefix]);
    setCurPrefix(history.length);
  };

  if (bucket.keys.length === 0) {
    return (
      <BrowseHint>
        This bucket has no keys. Create a key and grant read access to browse
        the bucket.
      </BrowseHint>
    );
  }

  const canRead = bucket.keys.some((key) => key.permissions.read);
  if (!canRead) {
    return (
      <BrowseHint>
        No key has read access to this bucket. Grant read access to a key to
        browse the bucket.
      </BrowseHint>
    );
  }

  const canWrite = bucket.keys.some(
    (key) => key.permissions.write || key.permissions.owner
  );

  return (
    <div>
      <Card className="pb-2">
        {!canWrite && (
          <p className="px-4 pt-2 text-sm text-base-content/60">
            A key with write access is required to upload or delete objects.
          </p>
        )}

        <ObjectListNavigator
          curPrefix={curPrefix}
          setCurPrefix={setCurPrefix}
          prefixHistory={prefixHistory}
          actions={
            <Actions
              prefix={prefixHistory[curPrefix] || ""}
              canWrite={canWrite}
            />
          }
        />

        <ObjectList
          prefix={prefixHistory[curPrefix] || ""}
          onPrefixChange={gotoPrefix}
        />

        <ShareDialog />
      </Card>
    </div>
  );
};

export default BrowseTab;

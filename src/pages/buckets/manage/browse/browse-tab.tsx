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

  const writePrefixToUrl = (prefix: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (prefix) {
      newParams.set("prefix", prefix);
    } else {
      newParams.delete("prefix");
    }
    setSearchParams(newParams);
  };

  // Read the prefix back from the URL. Browser Back and Forward change the
  // URL without in-app navigation, so the listing follows the URL here.
  // State keeps the in-app history, so Forward still works after an in-app
  // Back. A prefix already in the history only moves the index. Any other
  // prefix rebuilds the history from the URL.
  useEffect(() => {
    const urlPrefix = searchParams.get("prefix") ?? "";
    const currentPrefix = prefixHistory[curPrefix] ?? "";
    if (urlPrefix === currentPrefix) return;
    const index = prefixHistory.indexOf(urlPrefix);
    if (index >= 0) {
      setCurPrefix(index);
      return;
    }
    const nextHistory = getInitialPrefixes(searchParams);
    if (nextHistory.join("\n") === prefixHistory.join("\n")) return;
    setPrefixHistory(nextHistory);
    setCurPrefix(nextHistory.length - 1);
  }, [searchParams, prefixHistory, curPrefix]);

  const gotoPrefix = (prefix: string) => {
    const history = prefixHistory.slice(0, curPrefix + 1);
    setPrefixHistory([...history, prefix]);
    setCurPrefix(history.length);
    writePrefixToUrl(prefix);
  };

  const goToHistoryIndex: React.Dispatch<React.SetStateAction<number>> = (
    next
  ) => {
    const index = typeof next === "function" ? next(curPrefix) : next;
    if (index === curPrefix) return;
    setCurPrefix(index);
    writePrefixToUrl(prefixHistory[index] ?? "");
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
          setCurPrefix={goToHistoryIndex}
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

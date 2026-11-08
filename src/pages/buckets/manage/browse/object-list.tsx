import { Alert, Loading, Table } from "react-daisyui";
import { useBrowseObjectsInfinite } from "./hooks";
import { dayjs, readableBytes } from "@/lib/utils";
import mime from "mime/lite";
import { Object } from "./types";
import { API_URL } from "@/lib/api";
import {
  CircleXIcon,
  FileArchive,
  FileIcon,
  FileType,
  Folder,
} from "lucide-react";
import { useBucketContext } from "../context";
import ObjectActions from "./object-actions";
import GotoTopButton from "@/components/ui/goto-top-btn";
import Button from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

type Props = {
  prefix?: string;
  onPrefixChange?: (prefix: string) => void;
};

const ObjectList = ({ prefix, onPrefixChange }: Props) => {
  const { bucket } = useBucketContext();
  const [searchParams, setSearchParams] = useSearchParams();
  // The token and the prefix it belongs to, captured once on mount.
  // A prefix change clears the token: the token names a page of the
  // old prefix, not the new one.
  const [mountState] = useState(() => ({
    token: searchParams.get("next") ?? undefined,
    prefix,
  }));
  const initialToken =
    prefix === mountState.prefix ? mountState.token : undefined;
  const {
    data,
    error,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useBrowseObjectsInfinite(
    bucket.id,
    {
      prefix,
      limit: 1000,
    },
    initialToken
  );

  const pages = data?.pages ?? [];
  const prefixes = [...new Set(pages.flatMap((page) => page.prefixes))];
  const objects = pages.flatMap((page) => page.objects);
  const hasData = !!data;
  const lastPageParam =
    data && data.pageParams.length > 0
      ? data.pageParams[data.pageParams.length - 1]
      : undefined;

  // Keep the page token in the URL, so a refresh resumes from the
  // current page. Replace the entry: the token is list state, not a
  // navigation step. The token clears once the next prefix loads.
  // The effect depends on the boolean and the token, not the data
  // object: a new data identity must not re-run it.
  useEffect(() => {
    if (!hasData) {
      return;
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (lastPageParam) {
          next.set("next", lastPageParam);
        } else {
          next.delete("next");
        }
        return next;
      },
      { replace: true }
    );
  }, [hasData, lastPageParam, setSearchParams]);

  const onObjectClick = (object: Object) => {
    window.open(API_URL + object.url + "?view=1", "_blank", "noopener,noreferrer");
  };

  return (
    <div className="overflow-x-auto min-h-[400px]">
      {!bucket.globalAliases.length && pages[0]?.s3Bucket ? (
        <p className="px-4 pt-2 text-sm text-base-content/60">
          {`This bucket has no global alias. S3 requests use the local alias "${pages[0].s3Bucket}".`}
        </p>
      ) : null}

      <Table>
        <Table.Head>
          <span>Name</span>
          <span>Size</span>
          <span>Last Modified</span>
        </Table.Head>

        <Table.Body>
          {isLoading ? (
            <tr>
              <td colSpan={3}>
                <div className="h-[320px] flex items-center justify-center">
                  <Loading />
                </div>
              </td>
            </tr>
          ) : error ? (
            <tr>
              <td colSpan={3}>
                <Alert status="error" icon={<CircleXIcon />}>
                  <span>{error.message}</span>
                </Alert>
              </td>
            </tr>
          ) : !prefixes.length && !objects.length ? (
            <tr>
              <td className="text-center py-16" colSpan={3}>
                No objects
              </td>
            </tr>
          ) : null}

          {prefixes.map((prefix, idx) => (
            <tr
              key={prefix}
              className="hover:bg-neutral/60 hover:text-neutral-content group"
            >
              <td
                className="cursor-pointer"
                role="button"
                onClick={() => onPrefixChange?.(prefix)}
              >
                <span className="flex items-center gap-2 font-normal">
                  <Folder size={20} className="text-primary" />
                  {prefix
                    .substring(0, prefix.lastIndexOf("/"))
                    .split("/")
                    .pop()}
                </span>
              </td>
              <td colSpan={2} />
              <ObjectActions
                object={{ objectKey: prefix, url: "" }}
                end={
                  idx >= prefixes.length + objects.length - 2 &&
                  prefixes.length + objects.length > 5
                }
              />
            </tr>
          ))}

          {objects.map((object, idx) => {
            const extIdx = object.objectKey.lastIndexOf(".");
            const filename =
              extIdx >= 0
                ? object.objectKey.substring(0, extIdx)
                : object.objectKey;
            const ext = extIdx >= 0 ? object.objectKey.substring(extIdx) : null;

            return (
              <tr
                key={object.objectKey}
                className="hover:bg-neutral/60 hover:text-neutral-content group"
              >
                <td
                  className="cursor-pointer"
                  role="button"
                  onClick={() => onObjectClick(object)}
                >
                  <span className="flex items-center font-normal w-full">
                    <FilePreview ext={ext?.substring(1)} object={object} />
                    <span className="truncate max-w-[40vw]">{filename}</span>
                    {ext && <span className="text-base-content/60">{ext}</span>}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  {readableBytes(object.size)}
                </td>
                <td className="whitespace-nowrap">
                  {dayjs(object.lastModified).fromNow()}
                </td>
                <ObjectActions
                  prefix={prefix}
                  object={object}
                  end={idx >= objects.length - 2 && objects.length > 5}
                />
              </tr>
            );
          })}
        </Table.Body>
      </Table>

      {hasNextPage ? (
        <div className="px-4 py-3 flex flex-col items-start gap-2">
          <p className="text-sm text-base-content/60">More objects exist.</p>
          <Button
            color="primary"
            loading={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            Load more
          </Button>
        </div>
      ) : null}

      <GotoTopButton />
    </div>
  );
};

type FilePreviewProps = {
  ext?: string | null;
  object: Object;
};

const FilePreview = ({ ext, object }: FilePreviewProps) => {
  const [failed, setFailed] = useState(false);
  const type = mime.getType(ext || "")?.split("/")[0];
  let Icon = FileIcon;

  if (
    ["zip", "rar", "7z", "iso", "tar", "gz", "bz2", "xz"].includes(ext || "")
  ) {
    Icon = FileArchive;
  }

  if (type === "image") {
    const thumbnailSupport = ["jpg", "jpeg", "png", "gif"].includes(ext || "");
    if (thumbnailSupport && !failed) {
      return (
        <img
          src={API_URL + object.url + "?thumb=1"}
          alt={object.objectKey}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-5 object-cover overflow-hidden mr-2"
        />
      );
    }
  }

  if (type === "text") {
    Icon = FileType;
  }

  return (
    <Icon
      size={20}
      className="text-base-content/60 group-hover:text-neutral-content/80 mr-2"
    />
  );
};

export default ObjectList;

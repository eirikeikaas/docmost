import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useRemoveSpaceLinkMutation,
  useSetSpaceLinkMutation,
  useSpaceLinksQuery,
  useUpdateSpaceMutation,
} from "@/features/space/queries/space-query.ts";
import {
  ISpace,
  ISpaceLink,
  SpaceLinkProvider,
} from "@/features/space/types/space.types.ts";

// Marathon project id, e.g. FOU0002 or LÆRE0001. Spaces are tolerated on input.
const PROJECT_ID_PATTERN = /^[A-ZÆØÅ]{2,4}\d{4}$/;

const normalizeProjectId = (value: string) =>
  value.replace(/\s+/g, "").toLocaleUpperCase("nb-NO");

interface ProviderConfig {
  provider: SpaceLinkProvider;
  label: string;
  placeholder: string;
  urlRequired: boolean;
}

const PROVIDERS: ProviderConfig[] = [
  {
    provider: "sharepoint",
    label: "SharePoint folder",
    placeholder: "https://try.sharepoint.com/sites/…",
    urlRequired: true,
  },
  {
    provider: "linear",
    label: "Linear project",
    placeholder: "https://linear.app/…/project/…",
    urlRequired: true,
  },
  {
    provider: "trylle",
    label: "TRYlle project",
    placeholder: "Optional URL — otherwise resolved from the project id",
    urlRequired: false,
  },
  {
    provider: "busy",
    label: "Busy project",
    placeholder: "Optional URL — otherwise resolved from the project id",
    urlRequired: false,
  },
];

interface SpaceLinksSettingsProps {
  space: ISpace;
  readOnly?: boolean;
}

export default function SpaceLinksSettings({
  space,
  readOnly,
}: SpaceLinksSettingsProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useSpaceLinksQuery(space?.id);
  const updateSpaceMutation = useUpdateSpaceMutation();

  const [projectId, setProjectId] = useState("");
  useEffect(() => setProjectId(data?.projectId ?? ""), [data?.projectId]);

  const normalized = normalizeProjectId(projectId);
  const projectIdInvalid = normalized !== "" && !PROJECT_ID_PATTERN.test(normalized);
  const projectIdDirty = normalized !== (data?.projectId ?? "");

  const saveProjectId = async () => {
    await updateSpaceMutation.mutateAsync({
      spaceId: space.id,
      projectId: normalized,
    });
  };

  if (isLoading) return <Loader size="sm" mt="md" />;

  return (
    <Stack gap="lg" mt="md">
      <div>
        <Title order={3} size="h6" fw={600} mb="xs">
          {t("Marathon project")}
        </Title>
        <Text size="sm" c="dimmed" mb="xs">
          {t(
            "The project id owned by Marathon (two to four letters followed by four digits). It is shared by all the systems below.",
          )}
        </Text>
        <Group align="flex-start" gap="xs">
          <TextInput
            style={{ flex: 1 }}
            variant="filled"
            placeholder="FOU0002"
            value={projectId}
            readOnly={readOnly}
            error={
              projectIdInvalid
                ? t("Two to four letters followed by four digits")
                : undefined
            }
            onChange={(e) => setProjectId(e.currentTarget.value)}
          />
          {!readOnly && (
            <Button
              onClick={saveProjectId}
              disabled={!projectIdDirty || projectIdInvalid}
              loading={updateSpaceMutation.isPending}
            >
              {t("Save")}
            </Button>
          )}
        </Group>
      </div>

      <div>
        <Title order={3} size="h6" fw={600} mb="xs">
          {t("Linked systems")}
        </Title>
        <Stack gap="md">
          {PROVIDERS.map((config) => (
            <ProviderRow
              key={config.provider}
              spaceId={space.id}
              config={config}
              link={data?.links.find((l) => l.provider === config.provider)}
              readOnly={readOnly}
            />
          ))}
        </Stack>
      </div>
    </Stack>
  );
}

interface ProviderRowProps {
  spaceId: string;
  config: ProviderConfig;
  link?: ISpaceLink;
  readOnly?: boolean;
}

function ProviderRow({ spaceId, config, link, readOnly }: ProviderRowProps) {
  const { t } = useTranslation();
  const setLink = useSetSpaceLinkMutation(spaceId);
  const removeLink = useRemoveSpaceLinkMutation(spaceId);
  const [url, setUrl] = useState("");
  useEffect(() => setUrl(link?.url ?? ""), [link?.url]);

  const trimmed = url.trim();
  const dirty = !link || trimmed !== (link.url ?? "");
  const canSave = dirty && (!config.urlRequired || trimmed !== "");

  return (
    <Group align="flex-end" gap="xs">
      <TextInput
        style={{ flex: 1 }}
        variant="filled"
        label={t(config.label)}
        placeholder={config.placeholder}
        value={url}
        readOnly={readOnly}
        rightSection={
          !config.urlRequired && link ? (
            <Text size="xs" c="dimmed" pr="xs">
              {t("Linked")}
            </Text>
          ) : undefined
        }
        rightSectionWidth={!config.urlRequired && link ? 60 : undefined}
        onChange={(e) => setUrl(e.currentTarget.value)}
      />
      {!readOnly && (
        <>
          <Button
            onClick={() =>
              setLink.mutate({
                spaceId,
                provider: config.provider,
                url: trimmed || undefined,
              })
            }
            disabled={!canSave}
            loading={setLink.isPending}
          >
            {link ? t("Save") : t("Link")}
          </Button>
          {link && (
            <Tooltip label={t("Remove link")}>
              <ActionIcon
                size="lg"
                variant="subtle"
                color="red"
                aria-label={t("Remove link")}
                loading={removeLink.isPending}
                onClick={() =>
                  removeLink.mutate({ spaceId, provider: config.provider })
                }
              >
                <IconTrash size={16} />
              </ActionIcon>
            </Tooltip>
          )}
        </>
      )}
    </Group>
  );
}

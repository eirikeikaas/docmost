import { useEffect, useMemo, useState } from "react";
import { Group, Select, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useTranslation } from "react-i18next";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query.ts";
import { IUser } from "@/features/user/types/user.types.ts";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { UserRole } from "@/lib/types.ts";

interface Props {
  value: string;
  onChange: (userId: string) => void;
  error?: React.ReactNode;
}

// Picks the user a token authenticates as. Owners and deactivated users are not
// offered: the server refuses to bind a token to either.
export default function ServiceAccountSelect({
  value,
  onChange,
  error,
}: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 400);
  const { data } = useWorkspaceMembersQuery({
    query: debouncedSearch,
    limit: 50,
  });
  // Keep every user seen so far, so the chosen option survives a new search.
  const [known, setKnown] = useState<Record<string, IUser>>({});

  useEffect(() => {
    if (!data?.items) return;
    setKnown((previous) => {
      const next = { ...previous };
      for (const user of data.items) next[user.id] = user;
      return next;
    });
  }, [data]);

  const options = useMemo(
    () =>
      Object.values(known)
        .filter(
          (user) =>
            user.role !== UserRole.OWNER &&
            !user.deactivatedAt &&
            !user.deletedAt,
        )
        .map((user) => ({
          value: user.id,
          label: user.name || user.email,
          email: user.email,
          avatarUrl: user.avatarUrl,
        })),
    [known],
  );

  return (
    <Select
      withAsterisk
      label={t("Service account")}
      description={t(
        "The user the token acts as. It can reach exactly what this user can. Workspace owners cannot be chosen.",
      )}
      placeholder={t("Search for users")}
      data={options}
      value={value || null}
      onChange={(next) => onChange(next ?? "")}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      filter={({ options: items, search: query }) => {
        const needle = query.toLowerCase().trim();
        return items.filter((item) =>
          `${item["label"]} ${item["email"]}`.toLowerCase().includes(needle),
        );
      }}
      renderOption={({ option }) => (
        <Group gap="sm" wrap="nowrap">
          <CustomAvatar
            avatarUrl={option?.["avatarUrl"]}
            name={option.label}
            size={28}
          />
          <div>
            <Text size="sm" lineClamp={1}>
              {option.label}
            </Text>
            <Text size="xs" opacity={0.5}>
              {option?.["email"]}
            </Text>
          </div>
        </Group>
      )}
      nothingFoundMessage={t("No user found")}
      maxDropdownHeight={280}
      variant="filled"
      allowDeselect={false}
      error={error}
    />
  );
}

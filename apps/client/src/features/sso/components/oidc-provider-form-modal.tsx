import {
  Box,
  Button,
  Collapse,
  Divider,
  Group,
  Modal,
  PasswordInput,
  Select,
  Stack,
  Switch,
  TagsInput,
  Textarea,
  TextInput,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useForm } from "@mantine/form";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod/v4";
import { useTranslation } from "react-i18next";
import {
  useCreateOidcProviderMutation,
  useUpdateOidcProviderMutation,
} from "@/features/sso/queries/sso-query";
import { IOidcProvider } from "@/features/sso/types/sso.types";
import { formatRoleMap, parseRoleMapText } from "@/features/sso/utils/role-map";

const baseSchema = {
  name: z.string().trim().min(1).max(100),
  oidcIssuer: z.url(),
  oidcClientId: z.string().trim().min(1),
  allowSignup: z.boolean(),
  isEnabled: z.boolean(),
  trustUnverifiedEmail: z.boolean(),
  roleClaim: z.string().trim().min(1).max(200),
  roleMapText: z.string(),
  defaultRole: z.enum(["member", "admin"]),
  requiredRoles: z.array(z.string().trim().min(1).max(200)).max(50),
};

const createSchema = z.object({
  ...baseSchema,
  oidcClientSecret: z.string().trim().min(1),
});

const editSchema = z.object({
  ...baseSchema,
  oidcClientSecret: z.string(),
});

type FormValues = z.infer<typeof createSchema>;

interface Props {
  opened: boolean;
  onClose: () => void;
  provider?: IOidcProvider;
}

export default function OidcProviderFormModal({
  opened,
  onClose,
  provider,
}: Props) {
  const { t } = useTranslation();
  const createMutation = useCreateOidcProviderMutation();
  const updateMutation = useUpdateOidcProviderMutation();
  const isEdit = Boolean(provider);
  const [advancedOpened, { toggle: toggleAdvanced, open: openAdvanced }] =
    useDisclosure(false);
  const validateSchema = zod4Resolver(isEdit ? editSchema : createSchema);

  const form = useForm<FormValues>({
    validate: (values) => {
      const errors = validateSchema(values);
      if (parseRoleMapText(values.roleMapText) === null) {
        errors.roleMapText = t(
          "Use one claim=role pair per line, where the role is admin or member",
        );
      }
      return errors;
    },
    initialValues: {
      name: provider?.name ?? "",
      oidcIssuer: provider?.oidcIssuer ?? "",
      oidcClientId: provider?.oidcClientId ?? "",
      oidcClientSecret: "",
      allowSignup: provider?.allowSignup ?? false,
      isEnabled: provider?.isEnabled ?? false,
      trustUnverifiedEmail: provider?.trustUnverifiedEmail ?? false,
      roleClaim: provider?.roleClaim ?? "roles",
      roleMapText: formatRoleMap(provider?.roleMap),
      defaultRole: provider?.defaultRole ?? "member",
      requiredRoles: provider?.requiredRoles ?? [],
    },
  });

  const handleSubmit = async (values: FormValues) => {
    const { oidcClientSecret, roleMapText, ...rest } = values;
    const payload = {
      ...rest,
      roleMap: parseRoleMapText(roleMapText) ?? {},
    };

    if (isEdit) {
      await updateMutation.mutateAsync({
        id: provider.id,
        ...payload,
        // an empty secret field means "keep the existing one"
        oidcClientSecret: oidcClientSecret || undefined,
      });
    } else {
      await createMutation.mutateAsync({ ...payload, oidcClientSecret });
    }
    form.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={isEdit ? t("Edit OIDC provider") : t("Add OIDC provider")}
      closeButtonProps={{ "aria-label": t("Close") }}
    >
      <Divider size="xs" mb="xs" />
      <Box maw={500} mx="auto">
        <form
          onSubmit={form.onSubmit(handleSubmit, (errors) => {
            // Don't leave an error hidden inside the collapsed section.
            if (
              errors.roleClaim ||
              errors.roleMapText ||
              errors.defaultRole ||
              errors.requiredRoles
            ) {
              openAdvanced();
            }
          })}
        >
          <Stack>
            <TextInput
              withAsterisk
              label={t("Display name")}
              placeholder={t("e.g Okta")}
              variant="filled"
              {...form.getInputProps("name")}
            />
            <TextInput
              withAsterisk
              label={t("Issuer URL")}
              placeholder="https://your-idp.example.com"
              variant="filled"
              {...form.getInputProps("oidcIssuer")}
            />
            <TextInput
              withAsterisk
              label={t("Client ID")}
              variant="filled"
              {...form.getInputProps("oidcClientId")}
            />
            <PasswordInput
              withAsterisk={!isEdit}
              label={t("Client secret")}
              placeholder={
                isEdit ? t("Leave blank to keep the current secret") : ""
              }
              variant="filled"
              {...form.getInputProps("oidcClientSecret")}
            />
            <Switch
              label={t("Allow new users to sign up via this provider")}
              {...form.getInputProps("allowSignup", { type: "checkbox" })}
            />
            <Switch
              label={t("Enabled")}
              {...form.getInputProps("isEnabled", { type: "checkbox" })}
            />

            <Button
              variant="subtle"
              size="xs"
              px={0}
              justify="flex-start"
              onClick={toggleAdvanced}
            >
              {advancedOpened
                ? t("Hide advanced options")
                : t("Show advanced options")}
            </Button>
            <Collapse expanded={advancedOpened}>
              <Stack>
                <Switch
                  label={t("Trust the email address from this provider")}
                  description={t(
                    "Accept the email claim even when the provider does not mark it as verified, as Microsoft Entra ID does. Only enable this for an issuer you control, such as a tenant-specific Entra issuer.",
                  )}
                  {...form.getInputProps("trustUnverifiedEmail", {
                    type: "checkbox",
                  })}
                />
                <TextInput
                  label={t("Role claim")}
                  description={t("The claim that carries the user's roles")}
                  placeholder="roles"
                  variant="filled"
                  {...form.getInputProps("roleClaim")}
                />
                <Textarea
                  label={t("Role mapping")}
                  description={t(
                    "One claim=role pair per line, where the role is admin or member. Owners are never changed or created through SSO.",
                  )}
                  placeholder={"agents_admin=admin\nagents_manage=member"}
                  variant="filled"
                  autosize
                  minRows={2}
                  {...form.getInputProps("roleMapText")}
                />
                <Select
                  label={t("Default role for new users")}
                  description={t(
                    "Used when a new user's claim matches no role mapping",
                  )}
                  data={[
                    { value: "member", label: t("Member") },
                    { value: "admin", label: t("Admin") },
                  ]}
                  allowDeselect={false}
                  variant="filled"
                  {...form.getInputProps("defaultRole")}
                />
                <TagsInput
                  label={t("Required roles")}
                  description={t(
                    "If set, a user whose role claim has none of these cannot sign in",
                  )}
                  placeholder={t("Type a role and press Enter")}
                  variant="filled"
                  {...form.getInputProps("requiredRoles")}
                />
              </Stack>
            </Collapse>
          </Stack>

          <Group justify="flex-end" mt="md">
            <Button
              type="submit"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              {isEdit ? t("Save") : t("Create")}
            </Button>
          </Group>
        </form>
      </Box>
    </Modal>
  );
}

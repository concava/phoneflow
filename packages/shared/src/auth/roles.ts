import { createAccessControl } from "better-auth/plugins/access"
import {
  defaultStatements,
  ownerAc,
} from "better-auth/plugins/organization/access"

const statement = {
  ...defaultStatements,
  agent: ["create", "update", "delete"],
  phoneNumber: ["create", "update", "delete"],
  calls: ["create"],
  billing: ["purchase"],
  evaluation: ["create", "update", "delete", "run"],
}

export const ac = createAccessControl(statement)

export const owner = ac.newRole({
  ...ownerAc.statements,
  agent: ["create", "update", "delete"],
  phoneNumber: ["create", "update", "delete"],
  calls: ["create"],
  billing: ["purchase"],
  evaluation: ["create", "update", "delete", "run"],
})

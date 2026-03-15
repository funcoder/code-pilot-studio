@description('Sample environment name')
param environmentName string = 'dev'

resource appServicePlan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'asp-${environmentName}'
  location: resourceGroup().location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
}

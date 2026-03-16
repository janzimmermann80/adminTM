import { useParams } from 'react-router-dom'
import { Layout } from '../../components/Layout'
import { CompanyDetailPanel } from './CompanyDetailPanel'

export const CompanyDetail = () => {
  const { id } = useParams<{ id: string }>()
  return (
    <Layout>
      <CompanyDetailPanel companyKey={id!} />
    </Layout>
  )
}

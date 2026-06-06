package tech.pritamrao.kkrhms.lab;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

public interface LabTestRepository extends JpaRepository<LabTest, UUID> {

    boolean existsByCode(String code);

    boolean existsByCodeAndIdNot(String code, UUID id);

    @Query("""
            select t from LabTest t
            where (:category is null or t.category = :category)
              and (:isActive is null or t.isActive = :isActive)
              and (:name is null or :name = '' or lower(t.name) like lower(concat('%', :name, '%')))
            order by t.category asc, t.name asc
            """)
    Page<LabTest> search(@Param("category") String category,
                         @Param("isActive") Boolean isActive,
                         @Param("name") String name,
                         Pageable pageable);
}
